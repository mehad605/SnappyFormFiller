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

## Iteration 3 — Live Firefox Gecko BiDi E2E, Full Feature Coverage & Populated Screenshots (2026-11-26)
- **Changes:**
  - Added live headless Mozilla Firefox 161.0 WebDriver BiDi smoke test (`webExtension.install` of `dist/firefox/` + Gecko record/fill including open Shadow DOM) in `tests/e2e/run-e2e.mjs`.
  - Expanded `tests/unit/features-and-messaging.test.ts` to 38/38 total unit tests covering every feature's `popupActions` (`record`, `fill`, `clear-site`, `clear-all`, `export`, `import` across Chromium & Firefox, including cancel/empty/unmatched paths).
  - Captured and visually verified populated light/dark Popup screenshots (showing active origin, profile switcher, and inline-editable fields) and full-page Options screenshots in `docs/screenshots/`.
- **Scores (100/100, +4):** Modularity 10 (0), Readability 10 (0), Onboarding 10 (+1), Efficiency 10 (0), Technique 10 (0), Features 10 (+1), Icon 10 (0), Compatibility 10 (+1), Security 10 (0), Testing 10 (+1). **All categories reached 10/10 — loop complete.**
