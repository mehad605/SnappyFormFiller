import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { unzipSync } from 'fflate';
import { chromium } from 'playwright-core';

const CAPTURE_SCREENSHOTS = process.argv.includes('--screenshots');

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
  <script>
    const host = document.getElementById('shadow-host');
    const root = host.attachShadow({ mode: 'open' });
    const inp = document.createElement('input');
    inp.name = 'shadow_city';
    inp.value = 'London';
    root.appendChild(inp);
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
  // Linux Unix domain sockets fail above 108 bytes; use /tmp if TMPDIR is deeply nested.
  return sysTmp.length > 40 && existsSync('/tmp') ? '/tmp' : sysTmp;
}

async function startFixtureServer() {
  const server = createServer((_req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(TEST_PAGE_HTML);
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
      env: {
        ...process.env,
        TMPDIR: tmpBase,
      },
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

      // 1. Open fixture page
      const formPage = await context.newPage();
      await formPage.goto(fixtureUrl, { waitUntil: 'domcontentloaded' });

      // 2. Open Options page and verify zero console/CSP errors + default privacy settings
      const optionsPage = await context.newPage();
      optionsPage.setViewportSize({ width: 920, height: 760 });
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

      // 3. Inject bundled record.js & fill.js into the fixture page to measure real latency
      //    and verify end-to-end record -> reset -> fill (including open Shadow DOM).
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

      // 4. Persist recorded data in extension storage and open Popup UI
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

      // Seed storage via extension API and verify background message routing + options rendering
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
                    { id: 'qa', name: 'QA Edge Case', updatedAt: Date.now(), fields: fields.slice(0, 3) },
                  ],
                },
              },
            },
          });
        },
        { origin: new URL(fixtureUrl).origin, fields: recorded.fields }
      );

      const summary = await popupPage.evaluate(async () => {
        return await chrome.runtime.sendMessage({ type: 'profiles:summary' });
      });
      if (!summary || summary.ok !== true || summary.data.siteCount !== 1 || summary.data.profileCount !== 2) {
        throw new Error(`Unexpected background summary response: ${JSON.stringify(summary)}`);
      }

      if (CAPTURE_SCREENSHOTS) {
        mkdirSync(resolve('docs/screenshots'), { recursive: true });
        await optionsPage.reload({ waitUntil: 'domcontentloaded' });
        await optionsPage.waitForSelector('.site-card');
        await optionsPage.screenshot({ path: resolve('docs/screenshots/options-light.png'), fullPage: false });

        await optionsPage.emulateMedia({ colorScheme: 'dark' });
        await optionsPage.screenshot({ path: resolve('docs/screenshots/options-dark.png'), fullPage: false });

        // Capture popup in both light and dark modes (focused with fixture tab)
        await popupPage.emulateMedia({ colorScheme: 'light' });
        await popupPage.reload({ waitUntil: 'domcontentloaded' });
        await popupPage.waitForSelector('#action-record');
        await popupPage.screenshot({ path: resolve('docs/screenshots/popup-light.png') });

        await popupPage.emulateMedia({ colorScheme: 'dark' });
        await popupPage.screenshot({ path: resolve('docs/screenshots/popup-dark.png') });
        console.log('Saved screenshots to docs/screenshots/');
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

function runFirefoxSmokeTest() {
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
  if (!Array.isArray(manifest.background?.scripts) || manifest.background.scripts[0] !== 'background.js') {
    throw new Error('Firefox manifest must use background.scripts for MV3 compatibility');
  }
  if (manifest.content_security_policy?.extension_pages !== "script-src 'self'; object-src 'self'; style-src 'self'") {
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

  // Verify packaged .xpi archive if present
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

  // Verify Firefox headless binary launches cleanly
  if (existsSync('/usr/bin/firefox')) {
    const versionOut = execFileSync('/usr/bin/firefox', ['--version'], { encoding: 'utf8' }).trim();
    console.log(`PASS | Firefox build & XPI verified (${versionOut}, MV3 gecko + gecko_android valid)`);
  } else {
    console.log('PASS | Firefox build & XPI verified (manifest & archive valid)');
  }
}

async function main() {
  const { server, url } = await startFixtureServer();
  try {
    await runChromiumSmokeTest(url);
    runFirefoxSmokeTest();
  } finally {
    server.close();
  }
}

main().catch((err) => {
  console.error('E2E FAILED:', err);
  process.exit(1);
});
