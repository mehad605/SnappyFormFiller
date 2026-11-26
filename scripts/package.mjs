import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { zipSync } from 'fflate';

const pkg = JSON.parse(readFileSync(resolve('package.json'), 'utf8'));
const artifactsDir = resolve('artifacts');
mkdirSync(artifactsDir, { recursive: true });

function collectFiles(dir, rootDir = dir, acc = {}) {
  for (const entry of readdirSync(dir)) {
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      collectFiles(fullPath, rootDir, acc);
    } else {
      const rel = relative(rootDir, fullPath).replaceAll('\\', '/');
      acc[rel] = new Uint8Array(readFileSync(fullPath));
    }
  }
  return acc;
}

for (const target of ['chromium', 'firefox']) {
  const distDir = resolve('dist', target);
  const files = collectFiles(distDir);
  const zipped = zipSync(files, { level: 9 });
  const ext = target === 'firefox' ? 'xpi' : 'zip';
  const outFile = resolve(artifactsDir, `snappy-form-filler-${pkg.version}-${target}.${ext}`);
  writeFileSync(outFile, zipped);
  console.log(
    `Packaged ${relative(process.cwd(), outFile)} (${(zipped.byteLength / 1024).toFixed(2)} KB)`
  );
}
