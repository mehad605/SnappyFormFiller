# Improvement Loop Changelog

## Iteration 1 — Baseline Rewrite (2026-11-26)
- **Changes:**
  - Completed Phase 0 discovery (`docs/ANALYSIS.md`) and Phase 1 ADRs (`docs/decisions/001`–`006`, `docs/FEATURES.md`).
  - Rewrote extension in strict TypeScript + esbuild with modular `core/`, `platform/`, `features/`, `background/`, and `ui/` layers.
  - Designed new SVG icon (`assets/icons/icon.svg`) and exported 16, 32, 48, 96, 128, and 512 px PNGs.
  - Tree-shook popup-only code out of `background.js` (13.14 KB → 9.74 KB) to meet all efficiency budgets.
  - Built Chromium (`dist/chromium`, `.zip`) and Firefox (`dist/firefox`, `.xpi`) targets; verified 28 unit tests and Brave/Chromium E2E smoke test.
  - Added `README.md`, `CONTRIBUTING.md`, `docs/ARCHITECTURE.md`, CI workflow, pre-commit hook, and GitHub issue/PR templates.
- **Scorecard Baseline (87/100):** Modularity 9, Readability 9, Onboarding 8, Efficiency 9, Technique 10, Features 9, Icon 9, Compatibility 8, Security 8, Testing 8.
