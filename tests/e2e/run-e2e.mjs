import { execFileSync, spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { createServer as createNetServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { unzipSync } from 'fflate';
import { chromium } from 'playwright-core';

const CAPTURE_SCREENSHOTS = process.argv.includes('--screenshots');

const IFRAME_PAGE_HTML = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><title>Embedded Frame</title></head>
<body>
  <form id="iframe-form">
    <label for="iframeNote">Iframe Note</label>
    <input id="iframeNote" name="iframeNote" type="text" value="From Same-Origin Iframe" />
  </form>
</body>
</html>`;

const TEST_PAGE_HTML = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><title>Snappy E2E Fixture</title></head>
<body>
  <form id="e2e-form">
    <label for="fullName">Full Name</label>
    <input id="fullName" name="fullName" type="text" value="Ada Lovelace" />
    <input id="email" name="email" type="email" value="ada@analytical.engine" />
    <textarea id="notes" name="notes">Engine #1</textarea>
    <select id="role" name="role">
      <option value="dev">Dev</option>
      <option value="lead" selected>Lead</option>
    </select>
    <input id="agree" name="agree" type="checkbox" value="yes" checked />
    <input id="pw" name="pw" type="password" value="never-record-me" />
    <input id="captcha" name="captcha_token" type="text" value="bot-check" />
  </form>
  <div id="shadow-host"></div>
  <div id="closed-shadow-host"></div>
  <iframe id="same-origin-frame" src="/embed"></iframe>
  <script>
    const host = document.getElementById('shadow-host');
    const root = host.attachShadow({ mode: 'open' });
    const inp = document.createElement('input');
    inp.name = 'shadow_city';
    inp.value = 'London';
    root.appendChild(inp);

    const closedHost = document.getElementById('closed-shadow-host');
    const closedRoot = closedHost.attachShadow({ mode: 'closed' });
    const closedInp = document.createElement('input');
    closedInp.name = 'closed_shadow_postal';
    closedInp.value = 'SW1A';
    closedRoot.appendChild(closedInp);
    window.__closedShadowInput = closedInp;
  </script>
</body>
</html>`;

function findChromiumBinary() {
  const candidates = [
    process.env.CHROMIUM_PATH,
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/usr/bin/google-chrome',
    '/usr/bin/brave',
  ].filter(Boolean);
  for (const path of candidates) {
    if (existsSync(path)) return path;
  }
  return null;
}

function getShortTempBase() {
  const sysTmp = tmpdir();
  return sysTmp.length > 40 && existsSync('/tmp') ? '/tmp' : sysTmp;
}

async function getFreePort() {
  return new Promise((resolvePort, reject) => {
    const srv = createNetServer();
    srv.once('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const port = srv.address().port;
      srv.close(() => resolvePort(port));
    });
  });
}

async function startFixtureServer() {
  const server = createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(req.url === '/embed' ? IFRAME_PAGE_HTML : TEST_PAGE_HTML);
  });
  await new Promise((resolvePromise) => server.listen(0, '127.0.0.1', resolvePromise));
  const addr = server.address();
  return { server, url: `http://127.0.0.1:${addr.port}/form` };
}

async function runChromiumSmokeTest(fixtureUrl) {
  const executablePath = findChromiumBinary();
  if (!executablePath) {
    throw new Error('No Chromium/Brave binary found for E2E smoke test');
  }

  const extPath = resolve('dist/chromium');
  const tmpBase = getShortTempBase();
  const userDataDir = mkdtempSync(join(tmpBase, 'snappy-e2e-'));
  const consoleErrors = [];

  try {
    const context = await chromium.launchPersistentContext(userDataDir, {
      executablePath,
      headless: false,
      ignoreDefaultArgs: ['--disable-extensions'],
      env: { ...process.env, TMPDIR: tmpBase },
      args: [
        '--headless=new',
        `--disable-extensions-except=${extPath}`,
        `--load-extension=${extPath}`,
        '--no-sandbox',
        '--disable-gpu',
      ],
    });

    try {
      let [serviceWorker] = context.serviceWorkers();
      if (!serviceWorker) {
        serviceWorker = await context.waitForEvent('serviceworker', { timeout: 15000 });
      }
      const extensionId = new URL(serviceWorker.url()).host;
      if (!extensionId) {
        throw new Error('Could not resolve Chromium extension ID from service worker');
      }

      const formPage = await context.newPage();
      await formPage.goto(fixtureUrl, { waitUntil: 'load' });
      const iframe = formPage.frames().find((f) => f.url().endsWith('/embed'));
      if (!iframe) {
        throw new Error('Same-origin iframe did not load on fixture page');
      }

      const optionsPage = await context.newPage();
      await optionsPage.setViewportSize({ width: 920, height: 920 });
      optionsPage.on('pageerror', (err) => consoleErrors.push(err.message));
      optionsPage.on('console', (msg) => {
        if (msg.type() === 'error') consoleErrors.push(msg.text());
      });

      const optionsStart = performance.now();
      await optionsPage.goto(`chrome-extension://${extensionId}/options.html`, {
        waitUntil: 'domcontentloaded',
      });
      await optionsPage.waitForSelector('#optSkipPasswords');
      const optionsLoadMs = performance.now() - optionsStart;

      const skipPwChecked = await optionsPage.isChecked('#optSkipPasswords');
      const skipSensChecked = await optionsPage.isChecked('#optSkipSensitive');
      if (!skipPwChecked || !skipSensChecked) {
        throw new Error('Default privacy settings were not enabled in Options UI');
      }

      const recordBundle = readFileSync(resolve(extPath, 'scripts/record.js'), 'utf8');
      const fillBundle = readFileSync(resolve(extPath, 'scripts/fill.js'), 'utf8');

      const recordStart = performance.now();
      await formPage.addScriptTag({ content: recordBundle });
      const recorded = await formPage.evaluate(() => {
        const fn = globalThis.__snappyFormFillerRecordRunner;
        delete globalThis.__snappyFormFillerRecordRunner;
        return fn({ skipPasswords: true, skipSensitiveFields: true, skipEmptyOnRecord: false });
      });
      const recordMs = performance.now() - recordStart;

      if (recorded.fields.length !== 6 || recorded.skippedSensitive !== 1) {
        throw new Error(
          `Expected 6 recorded fields and 1 skipped sensitive, got ${recorded.fields.length} / ${recorded.skippedSensitive}`
        );
      }

      await formPage.evaluate(() => {
        document.getElementById('fullName').value = '';
        document.getElementById('email').value = '';
        document.getElementById('notes').value = '';
        document.getElementById('role').value = 'dev';
        document.getElementById('agree').checked = false;
        document.getElementById('shadow-host').shadowRoot.querySelector('input').value = '';
      });

      const fillStart = performance.now();
      await formPage.addScriptTag({ content: fillBundle });
      const filled = await formPage.evaluate((fields) => {
        const fn = globalThis.__snappyFormFillerFillRunner;
        delete globalThis.__snappyFormFillerFillRunner;
        return fn({ fields, highlightFilled: true });
      }, recorded.fields);
      const fillMs = performance.now() - fillStart;

      if (filled.filledCount !== 6 || filled.unmatchedLabels.length !== 0) {
        throw new Error(`Expected 6 filled / 0 unmatched, got ${JSON.stringify(filled)}`);
      }

      const verifiedValues = await formPage.evaluate(() => ({
        fullName: document.getElementById('fullName').value,
        email: document.getElementById('email').value,
        notes: document.getElementById('notes').value,
        role: document.getElementById('role').value,
        agree: document.getElementById('agree').checked,
        shadowCity: document.getElementById('shadow-host').shadowRoot.querySelector('input').value,
      }));

      if (
        verifiedValues.fullName !== 'Ada Lovelace' ||
        verifiedValues.email !== 'ada@analytical.engine' ||
        verifiedValues.notes !== 'Engine #1' ||
        verifiedValues.role !== 'lead' ||
        verifiedValues.agree !== true ||
        verifiedValues.shadowCity !== 'London'
      ) {
        throw new Error(`Filled values mismatch: ${JSON.stringify(verifiedValues)}`);
      }

      // Also verify same-origin iframe recording & filling with frameOrigin/framePath scoping
      await iframe.addScriptTag({ content: recordBundle });
      const iframeRecorded = await iframe.evaluate(() => {
        const fn = globalThis.__snappyFormFillerRecordRunner;
        delete globalThis.__snappyFormFillerRecordRunner;
        return fn({ skipPasswords: true, skipSensitiveFields: true, skipEmptyOnRecord: false });
      });
      if (
        iframeRecorded.fields.length !== 1 ||
        iframeRecorded.fields[0].locator.framePath !== '/embed'
      ) {
        throw new Error(
          `Expected 1 iframe field with /embed path, got ${JSON.stringify(iframeRecorded)}`
        );
      }
      await iframe.evaluate(() => {
        document.getElementById('iframeNote').value = '';
      });
      await iframe.addScriptTag({ content: fillBundle });
      const iframeFilled = await iframe.evaluate(
        (fields) => {
          const fn = globalThis.__snappyFormFillerFillRunner;
          delete globalThis.__snappyFormFillerFillRunner;
          return fn({ fields, highlightFilled: true });
        },
        [...recorded.fields, ...iframeRecorded.fields]
      );
      const iframeNoteVal = await iframe.evaluate(
        () => document.getElementById('iframeNote').value
      );
      if (iframeFilled.filledCount !== 1 || iframeNoteVal !== 'From Same-Origin Iframe') {
        throw new Error(`Iframe fill failed: ${JSON.stringify(iframeFilled)} / "${iframeNoteVal}"`);
      }

      const popupPage = await context.newPage();
      await popupPage.setViewportSize({ width: 380, height: 560 });
      popupPage.on('pageerror', (err) => consoleErrors.push(err.message));
      popupPage.on('console', (msg) => {
        if (msg.type() === 'error') consoleErrors.push(msg.text());
      });

      const popupStart = performance.now();
      await popupPage.goto(`chrome-extension://${extensionId}/popup.html`, {
        waitUntil: 'domcontentloaded',
      });
      await popupPage.waitForSelector('#action-record');
      await popupPage.waitForSelector('#action-fill');
      const popupLoadMs = performance.now() - popupStart;

      const demoOrigin = 'https://app.example.com';
      await popupPage.evaluate(
        async ({ origin, fields }) => {
          await chrome.storage.local.set({
            snappy_v3: {
              schemaVersion: 3,
              settings: {
                skipPasswords: true,
                skipSensitiveFields: true,
                highlightFilled: true,
                skipEmptyOnRecord: false,
              },
              sites: {
                [origin]: {
                  activeProfileId: 'default',
                  profiles: [
                    { id: 'default', name: 'Default', updatedAt: Date.now(), fields },
                    {
                      id: 'qa',
                      name: 'QA Edge Case',
                      updatedAt: Date.now(),
                      fields: fields.slice(0, 3),
                    },
                  ],
                },
              },
            },
          });
        },
        { origin: demoOrigin, fields: recorded.fields }
      );

      const summary = await popupPage.evaluate(async () => {
        return await chrome.runtime.sendMessage({ type: 'profiles:summary' });
      });
      if (
        !summary ||
        summary.ok !== true ||
        summary.data.siteCount !== 1 ||
        summary.data.profileCount !== 2
      ) {
        throw new Error(`Unexpected background summary response: ${JSON.stringify(summary)}`);
      }

      if (CAPTURE_SCREENSHOTS) {
        mkdirSync(resolve('docs/screenshots'), { recursive: true });

        await optionsPage.reload({ waitUntil: 'domcontentloaded' });
        await optionsPage.waitForSelector('.site-card');
        await optionsPage.waitForTimeout(250);
        await optionsPage.screenshot({
          path: resolve('docs/screenshots/options-light.png'),
          fullPage: true,
        });

        await optionsPage.emulateMedia({ colorScheme: 'dark' });
        await optionsPage.waitForTimeout(250);
        await optionsPage.screenshot({
          path: resolve('docs/screenshots/options-dark.png'),
          fullPage: true,
        });

        // Open a dedicated preview page simulating the active web tab so screenshots show the
        // real popup populated with profiles and inline-editable fields in light & dark mode.
        const shotPopup = await context.newPage();
        await shotPopup.setViewportSize({ width: 380, height: 600 });
        await shotPopup.addInitScript((origin) => {
          const origQuery = chrome.tabs.query.bind(chrome.tabs);
          chrome.tabs.query = async (queryInfo) => {
            if (queryInfo && queryInfo.active && queryInfo.currentWindow) {
              return [{ id: 1, url: `${origin}/signup` }];
            }
            return origQuery(queryInfo);
          };
        }, demoOrigin);

        await shotPopup.emulateMedia({ colorScheme: 'light' });
        await shotPopup.goto(`chrome-extension://${extensionId}/popup.html`, {
          waitUntil: 'domcontentloaded',
        });
        await shotPopup.waitForSelector('.field-row');
        await shotPopup.waitForTimeout(250);
        await shotPopup.screenshot({ path: resolve('docs/screenshots/popup-light.png') });

        await shotPopup.emulateMedia({ colorScheme: 'dark' });
        await shotPopup.waitForTimeout(250);
        await shotPopup.screenshot({ path: resolve('docs/screenshots/popup-dark.png') });
        await shotPopup.close();

        console.log('Saved screenshots to docs/screenshots/');
      }

      const LATENCY_BUDGETS = {
        popupLoadMs: 500,
        optionsLoadMs: 500,
        recordMs: 150,
        fillMs: 100,
      };
      if (popupLoadMs > LATENCY_BUDGETS.popupLoadMs) {
        throw new Error(
          `Popup load ${popupLoadMs.toFixed(1)}ms exceeded budget ${LATENCY_BUDGETS.popupLoadMs}ms`
        );
      }
      if (optionsLoadMs > LATENCY_BUDGETS.optionsLoadMs) {
        throw new Error(
          `Options load ${optionsLoadMs.toFixed(1)}ms exceeded budget ${LATENCY_BUDGETS.optionsLoadMs}ms`
        );
      }
      if (recordMs > LATENCY_BUDGETS.recordMs) {
        throw new Error(
          `Record execution ${recordMs.toFixed(1)}ms exceeded budget ${LATENCY_BUDGETS.recordMs}ms`
        );
      }
      if (fillMs > LATENCY_BUDGETS.fillMs) {
        throw new Error(
          `Fill execution ${fillMs.toFixed(1)}ms exceeded budget ${LATENCY_BUDGETS.fillMs}ms`
        );
      }

      if (consoleErrors.length > 0) {
        throw new Error(`Extension UI console/page errors: ${consoleErrors.join('; ')}`);
      }

      console.log(
        `PASS | Chromium (${executablePath}) E2E smoke test: popup=${popupLoadMs.toFixed(1)}ms, options=${optionsLoadMs.toFixed(1)}ms, record=${recordMs.toFixed(1)}ms, fill=${fillMs.toFixed(1)}ms`
      );
    } finally {
      await context.close();
    }
  } finally {
    rmSync(userDataDir, { recursive: true, force: true });
  }
}

async function connectBidi(wsUrl) {
  const ws = new globalThis.WebSocket(wsUrl);
  await new Promise((resolveOpen, reject) => {
    ws.addEventListener('open', resolveOpen, { once: true });
    ws.addEventListener('error', reject, { once: true });
  });

  let nextId = 1;
  const pending = new Map();
  ws.addEventListener('message', (event) => {
    const msg = JSON.parse(String(event.data));
    if (msg.id && pending.has(msg.id)) {
      const { resolveCmd, rejectCmd } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.type === 'error') {
        rejectCmd(new Error(`${msg.error}: ${msg.message}`));
      } else {
        resolveCmd(msg.result);
      }
    }
  });

  const send = (method, params = {}) =>
    new Promise((resolveCmd, rejectCmd) => {
      const id = nextId++;
      pending.set(id, { resolveCmd, rejectCmd });
      ws.send(JSON.stringify({ id, method, params }));
    });

  return { ws, send };
}

async function runFirefoxGeckoBidiTest(firefoxDir, fixtureUrl) {
  const port = await getFreePort();
  const profileDir = mkdtempSync(join(getShortTempBase(), 'snappy-ff-'));
  writeFileSync(
    join(profileDir, 'user.js'),
    [
      'user_pref("remote.active-protocols", 1);',
      'user_pref("xpinstall.signatures.required", false);',
      'user_pref("extensions.experiments.enabled", true);',
    ].join('\n'),
    'utf8'
  );

  const proc = spawn(
    '/usr/bin/firefox',
    ['--headless', '--no-remote', '--profile', profileDir, '--remote-debugging-port', String(port)],
    { stdio: ['ignore', 'pipe', 'pipe'] }
  );

  let stderrBuf = '';
  proc.stderr.on('data', (chunk) => {
    stderrBuf += chunk.toString();
  });

  try {
    // Wait until Firefox Remote Agent prints listening URL
    const wsUrl = await new Promise((resolveUrl, reject) => {
      const deadline = setTimeout(
        () => reject(new Error(`Firefox BiDi startup timed out. stderr: ${stderrBuf}`)),
        15000
      );
      const check = () => {
        const match = stderrBuf.match(/WebDriver BiDi listening on (ws:\/\/[^\s]+)/);
        if (match) {
          clearTimeout(deadline);
          resolveUrl(`${match[1]}/session`);
        }
      };
      proc.stderr.on('data', check);
      proc.once('exit', (code) => {
        clearTimeout(deadline);
        reject(new Error(`Firefox exited early (${code}): ${stderrBuf}`));
      });
    });

    const { ws, send } = await connectBidi(wsUrl);
    try {
      await send('session.new', { capabilities: {} });

      // 1. Install our real unpacked dist/firefox MV3 extension into Gecko!
      const installed = await send('webExtension.install', {
        extensionData: { type: 'path', path: firefoxDir },
      });
      if (!installed?.extension) {
        throw new Error(`Firefox webExtension.install failed: ${JSON.stringify(installed)}`);
      }

      // 2. Navigate a real Gecko browsing context to our test form fixture
      const tree = await send('browsingContext.getTree', {});
      const contextId = tree.contexts[0].context;
      await send('browsingContext.navigate', {
        context: contextId,
        url: fixtureUrl,
        wait: 'complete',
      });

      // 3. Execute our real dist/firefox/scripts/record.js & fill.js inside Gecko!
      const recordBundle = readFileSync(join(firefoxDir, 'scripts/record.js'), 'utf8');
      const fillBundle = readFileSync(join(firefoxDir, 'scripts/fill.js'), 'utf8');

      const recordEval = await send('script.evaluate', {
        expression: `(() => {
          ${recordBundle}
          const fn = globalThis.__snappyFormFillerRecordRunner;
          delete globalThis.__snappyFormFillerRecordRunner;
          return JSON.stringify(fn({ skipPasswords: true, skipSensitiveFields: true, skipEmptyOnRecord: false }));
        })()`,
        target: { context: contextId },
        awaitPromise: false,
      });

      const recorded = JSON.parse(recordEval.result.value);
      if (recorded.fields.length !== 6 || recorded.skippedSensitive !== 1) {
        throw new Error(`Gecko record mismatch: ${JSON.stringify(recorded)}`);
      }

      const fillEval = await send('script.evaluate', {
        expression: `(() => {
          document.getElementById('fullName').value = '';
          document.getElementById('email').value = '';
          document.getElementById('notes').value = '';
          document.getElementById('role').value = 'dev';
          document.getElementById('agree').checked = false;
          document.getElementById('shadow-host').shadowRoot.querySelector('input').value = '';
          ${fillBundle}
          const fn = globalThis.__snappyFormFillerFillRunner;
          delete globalThis.__snappyFormFillerFillRunner;
          const res = fn({ fields: ${JSON.stringify(recorded.fields)}, highlightFilled: true });
          return JSON.stringify({
            res,
            fullName: document.getElementById('fullName').value,
            agree: document.getElementById('agree').checked,
            shadowCity: document.getElementById('shadow-host').shadowRoot.querySelector('input').value,
          });
        })()`,
        target: { context: contextId },
        awaitPromise: false,
      });

      const geckoFilled = JSON.parse(fillEval.result.value);
      if (
        geckoFilled.res.filledCount !== 6 ||
        geckoFilled.res.unmatchedLabels.length !== 0 ||
        geckoFilled.fullName !== 'Ada Lovelace' ||
        geckoFilled.agree !== true ||
        geckoFilled.shadowCity !== 'London'
      ) {
        throw new Error(`Gecko fill mismatch: ${JSON.stringify(geckoFilled)}`);
      }

      return installed.extension;
    } finally {
      ws.close();
    }
  } finally {
    proc.kill('SIGTERM');
    await new Promise((r) => setTimeout(r, 300));
    rmSync(profileDir, { recursive: true, force: true });
  }
}

async function runFirefoxSmokeTest(fixtureUrl) {
  const firefoxDir = resolve('dist/firefox');
  const manifest = JSON.parse(readFileSync(join(firefoxDir, 'manifest.json'), 'utf8'));

  if (manifest.manifest_version !== 3) {
    throw new Error('Firefox manifest must be MV3');
  }
  if (!manifest.browser_specific_settings?.gecko?.id) {
    throw new Error('Firefox manifest missing gecko.id');
  }
  if (!manifest.browser_specific_settings?.gecko_android?.strict_min_version) {
    throw new Error('Firefox manifest missing gecko_android config');
  }
  if (
    !Array.isArray(manifest.background?.scripts) ||
    manifest.background.scripts[0] !== 'background.js'
  ) {
    throw new Error('Firefox manifest must use background.scripts for MV3 compatibility');
  }
  if (
    manifest.content_security_policy?.extension_pages !==
    "script-src 'self'; object-src 'self'; style-src 'self'"
  ) {
    throw new Error('Firefox manifest missing strict CSP');
  }

  const requiredFiles = [
    'manifest.json',
    'popup.html',
    'popup.js',
    'popup.css',
    'options.html',
    'options.js',
    'options.css',
    'tokens.css',
    'background.js',
    'scripts/record.js',
    'scripts/fill.js',
    'icons/icon-16.png',
    'icons/icon-32.png',
    'icons/icon-48.png',
    'icons/icon-96.png',
    'icons/icon-128.png',
  ];

  for (const rel of requiredFiles) {
    if (!existsSync(join(firefoxDir, rel))) {
      throw new Error(`Firefox dist missing required file: ${rel}`);
    }
  }

  const firefoxPopupJs = readFileSync(join(firefoxDir, 'popup.js'), 'utf8');
  if (!firefoxPopupJs.includes('"firefox"')) {
    throw new Error('Firefox popup.js was not compiled with __BUILD_TARGET__="firefox"');
  }

  const pkg = JSON.parse(readFileSync(resolve('package.json'), 'utf8'));
  const xpiPath = resolve('artifacts', `snappy-form-filler-${pkg.version}-firefox.xpi`);
  if (existsSync(xpiPath)) {
    const entries = unzipSync(new Uint8Array(readFileSync(xpiPath)));
    for (const rel of requiredFiles) {
      if (!(rel in entries)) {
        throw new Error(`Firefox XPI missing entry: ${rel}`);
      }
    }
  }

  if (existsSync('/usr/bin/firefox')) {
    const versionOut = execFileSync('/usr/bin/firefox', ['--version'], { encoding: 'utf8' }).trim();
    const installedId = await runFirefoxGeckoBidiTest(firefoxDir, fixtureUrl);
    console.log(
      `PASS | Firefox (${versionOut}) live Gecko BiDi smoke test: installed ${installedId}, record & fill (incl. Shadow DOM) passed`
    );
  } else {
    console.log('PASS | Firefox build & XPI verified (manifest & archive valid)');
  }
}

async function main() {
  const { server, url } = await startFixtureServer();
  try {
    await runChromiumSmokeTest(url);
    await runFirefoxSmokeTest(url);
  } finally {
    server.close();
  }
}

main().catch((err) => {
  console.error('E2E FAILED:', err);
  process.exit(1);
});
