# ADR 001: Language and Build Tooling

- **Status:** Accepted
- **Date:** 2026-11-26

## Context

The v2.0 codebase consists of 4 raw JavaScript/HTML files with no type checking, no linter, no bundler, and no multi-browser build pipeline. That lack of tooling directly contributed to several production defects found in `docs/ANALYSIS.md`:

- A fatal `ReferenceError` in `frameworkAwareFill` caused by referencing `fieldLabel` outside the serialized injected function scope.
- Null-reference bugs (`tabs[0]`, `currentOrigin`) and duplicate function declarations.
- Inability to produce distinct Chromium and Firefox MV3 manifests from one source of truth.

We need a toolchain that provides strict static typing, fast incremental builds, tiny output bundles, simple contributor onboarding, and minimal dependency surface.

## Options Considered

| Option                   | Pros                                                                                                                                                                                           | Cons                                                                                                                                                         | Estimated Runtime Overhead          |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------- |
| **Plain JS (no build)**  | Zero setup, instant edits                                                                                                                                                                      | No type checking; manual manifest duplication for Chromium/Firefox; hard to share code between popup and injected page scripts without globals or copy-paste | 0 KB                                |
| **TypeScript + esbuild** | Strict type checking; sub-50ms builds; native multi-entry bundling (cleanly bundles standalone injected scripts with zero external closure dependencies); tiny output; minimal devDependencies | Requires writing a small ~120-line build script for manifest generation and watch mode                                                                       | ~0 KB (no framework/loader runtime) |
| **Vite + CRXJS**         | Great HMR for large React/Vue popups                                                                                                                                                           | CRXJS has recurring MV3/Firefox compatibility issues; larger dependency tree; overkill for vanilla UI                                                        | ~2–5 KB module preload helpers      |
| **WXT / Plasmo**         | Convention-based extension frameworks with auto-generated manifests                                                                                                                            | Heavy abstraction layer; Plasmo pulls React by default and lags on MV3/Firefox edge cases; obscures standard extension mechanics from new contributors       | ~10–50 KB+                          |

## Decision

Adopt **TypeScript (`strict: true`) + esbuild** with a small, transparent Node build script (`scripts/build.mjs`) and manifest generator (`scripts/manifest.mjs`).

Key reasons:

1. **Fixes the exact v2.0 injection bug structurally:** Each page-injected script (`record` and `fill`) is compiled by esbuild as a self-contained IIFE entry point with all shared helpers cleanly bundled inside. It becomes structurally impossible to accidentally depend on an out-of-scope closure function.
2. **Measurably faster and smaller:** esbuild builds both Chromium and Firefox targets in < 100 ms with zero runtime wrapper overhead, keeping total extension package size well below our 100 KB budget.
3. **Contributor clarity:** Any engineer can read `scripts/build.mjs` in 2 minutes and understand every file emitted into `dist/chromium/` and `dist/firefox/`.
4. **Dev experience:** `npm run dev` runs esbuild in watch mode with incremental rebuilds (< 20 ms) and automatic manifest/asset syncing.

## Trade-offs

- We maintain ~150 lines of build/packaging scripts ourselves instead of delegating to WXT/Plasmo. Given the simplicity of our extension (2 HTML pages, 1 service worker, 2 injected scripts), owning that script is a net win in transparency, security, and Firefox reliability.
- Contributors need Node.js >= 20 and `npm install` before building (mitigated by one-command setup documented in `README.md` and `CONTRIBUTING.md`).
