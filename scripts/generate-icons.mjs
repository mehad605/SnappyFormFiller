import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const SIZES = [16, 32, 48, 96, 128, 512];
const svgPath = resolve('assets/icons/icon.svg');

if (!existsSync(svgPath)) {
  throw new Error(`Missing source icon: ${svgPath}`);
}

for (const size of SIZES) {
  const outPath = resolve('assets/icons', `icon-${size}.png`);
  execFileSync('rsvg-convert', ['-w', String(size), '-h', String(size), svgPath, '-o', outPath]);
  console.log(`Generated assets/icons/icon-${size}.png (${size}x${size})`);
}
