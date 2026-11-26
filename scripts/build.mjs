import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import * as esbuild from 'esbuild';
import { buildManifest } from './manifest.mjs';

const args = process.argv.slice(2);
const watchMode = args.includes('--watch');
const targetArg = args.find((a) => a.startsWith('--target='))?.split('=')[1] ?? 'all';
const targets = targetArg === 'all' ? ['chromium', 'firefox'] : [targetArg];

for (const t of targets) {
  if (t !== 'chromium' && t !== 'firefox') {
    throw new Error(`Invalid --target value "${t}". Expected chromium, firefox, or all.`);
  }
}

const STATIC_COPIES = [
  ['src/ui/popup/popup.html', 'popup.html'],
  ['src/ui/popup/popup.css', 'popup.css'],
  ['src/ui/options/options.html', 'options.html'],
  ['src/ui/options/options.css', 'options.css'],
  ['src/ui/shared/tokens.css', 'tokens.css'],
];

const ICON_SIZES = [16, 32, 48, 96, 128];

function copyStaticAssets(target) {
  const outDir = resolve('dist', target);
  mkdirSync(resolve(outDir, 'icons'), { recursive: true });
  mkdirSync(resolve(outDir, 'scripts'), { recursive: true });

  for (const [src, dest] of STATIC_COPIES) {
    cpSync(resolve(src), resolve(outDir, dest));
  }

  for (const size of ICON_SIZES) {
    const iconSrc = resolve('assets/icons', `icon-${size}.png`);
    if (existsSync(iconSrc)) {
      cpSync(iconSrc, resolve(outDir, 'icons', `icon-${size}.png`));
    }
  }

  const manifest = buildManifest(target);
  writeFileSync(resolve(outDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
}

function createEsbuildConfigs(target) {
  const outDir = resolve('dist', target);
  const common = {
    bundle: true,
    minify: !watchMode,
    sourcemap: watchMode ? 'inline' : false,
    target: ['chrome109', 'firefox109'],
    logLevel: 'silent',
    define: {
      __BUILD_TARGET__: JSON.stringify(target),
    },
  };

  /** @type {import('esbuild').BuildOptions[]} */
  return [
    // Extension pages & background (ESM)
    {
      ...common,
      format: 'esm',
      entryPoints: {
        popup: resolve('src/ui/popup/popup.ts'),
        options: resolve('src/ui/options/options.ts'),
        background: resolve('src/background/index.ts'),
      },
      outdir: outDir,
    },
    // Self-contained page-injected scripts (IIFE — zero external closure dependencies)
    {
      ...common,
      format: 'iife',
      entryPoints: {
        record: resolve('src/features/recorder/page-entry.ts'),
        fill: resolve('src/features/filler/page-entry.ts'),
      },
      outdir: resolve(outDir, 'scripts'),
    },
  ];
}

async function run() {
  const start = performance.now();

  if (watchMode) {
    const contexts = [];
    for (const target of targets) {
      copyStaticAssets(target);
      for (const config of createEsbuildConfigs(target)) {
        const ctx = await esbuild.context({
          ...config,
          plugins: [
            {
              name: 'sync-static',
              setup(build) {
                build.onEnd((result) => {
                  copyStaticAssets(target);
                  const status = result.errors.length === 0 ? 'rebuilt' : 'failed';
                  console.log(`[${new Date().toLocaleTimeString()}] ${target}: ${status}`);
                });
              },
            },
          ],
        });
        await ctx.watch();
        contexts.push(ctx);
      }
    }
    console.log(`Watching targets: ${targets.join(', ')} (press Ctrl+C to stop)`);
    return;
  }

  for (const target of targets) {
    const outDir = resolve('dist', target);
    rmSync(outDir, { recursive: true, force: true });
    copyStaticAssets(target);
    for (const config of createEsbuildConfigs(target)) {
      await esbuild.build(config);
    }
  }

  const elapsed = (performance.now() - start).toFixed(0);
  console.log(`Built ${targets.join(', ')} in ${elapsed} ms`);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
