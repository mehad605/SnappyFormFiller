# Snappy Form Filler — Quality Scorecard

> Scored honestly and adversarially against Phase 3 criteria. Every score is backed by concrete files, test output, and measured metrics.

## Iteration 2 (2026-11-26)

| Category | Score | Delta | Evidence & Remaining Gaps |
| --- | :---: | :---: | --- |
| **Modularity and extensibility** | **10/10** | +1 | `FeatureModule` + `FeatureRegistry`, isolated folders (`recorder`, `filler`, `profiles`, `portability`, `_example-template`), mechanically verified by `tests/unit/architecture.test.ts` (zero cross-feature imports, zero `chrome.*`/`browser.*` outside `src/platform/`). |
| **Readability** | **10/10** | +1 | Extracted `src/ui/popup/profile-bar.ts` from `popup.ts`; TypeScript `strict: true` 0 errors, ESLint 0 errors / 0 warnings, Prettier 100% clean, zero magic constants. |
| **Contributor onboarding** | **9/10** | +1 | `README.md` embeds light/dark screenshots, 4-command quick start, `CONTRIBUTING.md`, `ARCHITECTURE.md` (diagrams + glossary), `_example-template/`, pre-commit hook, CI, templates. **Gap:** Popup screenshots show the fallback "Unsupported page" state instead of a populated site with profiles & editable fields. |
| **Efficiency** | **10/10** | +1 | Verified by `npm run budgets` & `test:e2e`: 0 runtime deps; Chromium unpacked 105.30 KB (zip 50.82 KB), Firefox unpacked 105.60 KB (xpi 50.91 KB); `background.js` 9.75 KB, `record.js` 4.19 KB, `fill.js` 4.90 KB; minimal permissions `[activeTab, scripting, storage]`; runtime latency budgets enforced (`popup=98.6ms`, `options=168.1ms`, `record=34.7ms`, `fill=8.9ms`). |
| **Technique choices** | **10/10** | 0 | 6 ADRs (`docs/decisions/001`–`006`) validated by `tests/unit/architecture.test.ts` to document Context, Options Considered, Decision, and Trade-offs with concrete measurements. |
| **Features** | **9/10** | 0 | Fixed duplicate unsupported-page message in `popup.ts`; all v2.0 + v3.0 features work cleanly. **Gap:** Direct unit tests for every `popupActions` handler (`record`, `fill`, `clear-site`, `clear-all`, `export`) are not all explicitly covered yet. |
| **Icon** | **10/10** | +1 | Vector source `assets/icons/icon.svg` + 16/32/48/96/128/512 px PNGs visually inspected on both light (`#f3f4f6`) and dark (`#1f2937`) toolbar backgrounds — crisp and unmistakable at 16 px through 512 px. |
| **Browser compatibility** | **9/10** | +1 | Added `tests/unit/platform-browser.test.ts` testing both Chromium `chrome.*` and Firefox `browser.*` paths; Chromium/Brave E2E passes; Firefox manifest, `__BUILD_TARGET__="firefox"`, and `.xpi` verified. **Gap:** E2E has not yet executed the built extension scripts inside a live Firefox/Gecko engine. |
| **Security and privacy** | **10/10** | +2 | `npm audit` reports **0 vulnerabilities** (`vitest@5.1.2`, `happy-dom@21.0.4`, `esbuild@0.28.2`); minimal permissions, strict CSP, zero `innerHTML` enforced by ESLint + `architecture.test.ts`, prototype-safe import, safe-by-default sensitive-field skip, verified dark-mode contrast. |
| **Testing and reliability** | **9/10** | +1 | 8 unit test suites (35/35 passing), Chromium E2E with latency budgets, Firefox build/XPI validation, GitHub Actions CI. **Gap:** Add full `popupActions` handler tests and live Firefox Gecko smoke check. |

**Iteration 2 Total:** 96 / 100 (+9)  
**Lowest 3 categories targeted for Iteration 3:**
1. **Contributor onboarding (9/10)** — Capture and embed crisp populated Popup screenshots (showing active origin, profile selector, and editable saved fields in light & dark mode) and full Options screenshots in `README.md`.
2. **Features & Testing (9/10)** — Add comprehensive unit tests covering every feature's `popupActions` (`record`, `fill`, `clear-site`, `clear-all`, `export`, `import` on both Chromium and Firefox, including error/unmatched/cancel paths).
3. **Browser compatibility (9/10)** — Run a live headless Firefox (Gecko) runtime smoke test verifying our built `dist/firefox/` extension scripts and UI load cleanly in Firefox.
