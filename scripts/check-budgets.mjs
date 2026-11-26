import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

const pkg = JSON.parse(readFileSync(resolve('package.json'), 'utf8'));

/**
 * Measurable efficiency budgets (Phase 2).
 * Every limit is verified on every CI run and local `npm run budgets`.
 */
const BUDGETS = {
  maxUnpackedBytes: 120 * 1024, // 120 KB total unpacked per target (including PNG icons)
  maxZipBytes: 60 * 1024, // 60 KB compressed store package
  maxPopupJsBytes: 35 * 1024, // 35 KB minified popup bundle
  maxOptionsJsBytes: 35 * 1024, // 35 KB minified options bundle
  maxBackgroundJsBytes: 12 * 1024, // 12 KB minified background worker
  maxInjectedScriptBytes: 15 * 1024, // 15 KB per injected script (record.js / fill.js)
  allowedPermissions: ['activeTab', 'scripting', 'storage'],
  maxRuntimeDependencies: 0,
};

function dirSize(dir) {
  let total = 0;
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const s = statSync(full);
    total += s.isDirectory() ? dirSize(full) : s.size;
  }
  return total;
}

let failed = false;

function assertBudget(label, actual, limit, unit = 'B') {
  const ok = actual <= limit;
  const fmt = (v) => (unit === 'KB' ? `${(v / 1024).toFixed(2)} KB` : `${v}`);
  console.log(`${ok ? 'PASS' : 'FAIL'} | ${label}: ${fmt(actual)} / ${fmt(limit)}`);
  if (!ok) failed = true;
}

const runtimeDeps = Object.keys(pkg.dependencies ?? {}).length;
assertBudget('Runtime dependencies', runtimeDeps, BUDGETS.maxRuntimeDependencies, 'count');

for (const target of ['chromium', 'firefox']) {
  const distDir = resolve('dist', target);
  const unpacked = dirSize(distDir);
  assertBudget(`${target} unpacked total`, unpacked, BUDGETS.maxUnpackedBytes, 'KB');

  const ext = target === 'firefox' ? 'xpi' : 'zip';
  const archive = statSync(
    resolve('artifacts', `snappy-form-filler-${pkg.version}-${target}.${ext}`)
  ).size;
  assertBudget(`${target} packaged archive`, archive, BUDGETS.maxZipBytes, 'KB');

  assertBudget(
    `${target} popup.js`,
    statSync(join(distDir, 'popup.js')).size,
    BUDGETS.maxPopupJsBytes,
    'KB'
  );
  assertBudget(
    `${target} options.js`,
    statSync(join(distDir, 'options.js')).size,
    BUDGETS.maxOptionsJsBytes,
    'KB'
  );
  assertBudget(
    `${target} background.js`,
    statSync(join(distDir, 'background.js')).size,
    BUDGETS.maxBackgroundJsBytes,
    'KB'
  );
  assertBudget(
    `${target} scripts/record.js`,
    statSync(join(distDir, 'scripts/record.js')).size,
    BUDGETS.maxInjectedScriptBytes,
    'KB'
  );
  assertBudget(
    `${target} scripts/fill.js`,
    statSync(join(distDir, 'scripts/fill.js')).size,
    BUDGETS.maxInjectedScriptBytes,
    'KB'
  );

  const manifest = JSON.parse(readFileSync(join(distDir, 'manifest.json'), 'utf8'));
  const perms = [...(manifest.permissions ?? [])].sort();
  const allowed = [...BUDGETS.allowedPermissions].sort();
  const permsOk = JSON.stringify(perms) === JSON.stringify(allowed) && !manifest.host_permissions;
  console.log(
    `${permsOk ? 'PASS' : 'FAIL'} | ${target} permissions: [${perms.join(', ')}] (host_permissions: none)`
  );
  if (!permsOk) failed = true;
}

if (failed) {
  console.error('\nOne or more efficiency budgets failed.');
  process.exit(1);
}
console.log('\nAll efficiency budgets passed.');
