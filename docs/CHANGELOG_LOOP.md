# Improvement Loop Changelog

## Iteration 1 — Baseline Rewrite (2026-11-26)
- **Changes:**
  - Completed Phase 0 discovery (`docs/ANALYSIS.md`) and Phase 1 ADRs (`docs/decisions/001`–`006`, `docs/FEATURES.md`).
  - Rewrote extension in strict TypeScript + esbuild with modular `core/`, `platform/`, `features/`, `background/`, and `ui/` layers.
  - Designed new SVG icon (`assets/icons/icon.svg`) and exported 16, 32, 48, 96, 128, and 512 px PNGs.
  - Tree-shook popup-only code out of `background.js` (13.14 KB → 9.74 KB) to meet all efficiency budgets.
  - Built Chromium (`dist/chromium`, `.zip`) and Firefox (`dist/firefox`, `.xpi`) targets; verified 28 unit tests and Brave/Chromium E2E smoke test.
  - Added `README.md`, `CONTRIBUTING.md`, `docs/ARCHITECTURE.md`, CI workflow, pre-commit hook, and GitHub issue/PR templates.
- **Scores (87/100):** Modularity 9, Readability 9, Onboarding 8, Efficiency 9, Technique 10, Features 9, Icon 9, Compatibility 8, Security 8, Testing 8.

## Iteration 2 — Security Audit, Platform Tests, Readability & Budgets (2026-11-26)
- **Changes:**
  - Upgraded `vitest@5.1.2`, `happy-dom@21.0.4`, and `esbuild@0.28.2`, resolving all 4 `npm audit` vulnerabilities (**0 vulnerabilities**).
  - Extracted `src/ui/popup/profile-bar.ts` from `popup.ts` and fixed duplicate unsupported-page copy.
  - Added `tests/unit/platform-browser.test.ts` (Chromium `chrome.*` & Firefox `browser.*` coverage) and `tests/unit/architecture.test.ts` (enforcing zero cross-feature imports, zero direct browser globals, zero `innerHTML`, ADR completeness).
  - Enforced runtime latency budgets in `tests/e2e/run-e2e.mjs`, verified Firefox `__BUILD_TARGET__="firefox"` + `.xpi` contents, fixed dark-mode screenshot transition wait, visually verified icons on light/dark toolbars, and embedded screenshots in `README.md`.
- **Scores (96/100, +9):** Modularity 10 (+1), Readability 10 (+1), Onboarding 9 (+1), Efficiency 10 (+1), Technique 10 (0), Features 9 (0), Icon 10 (+1), Compatibility 9 (+1), Security 10 (+2), Testing 9 (+1).
