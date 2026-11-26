# Snappy Form Filler — Quality Scorecard

> Scored honestly and adversarially against Phase 3 criteria. Every score is backed by concrete files, test output, and measured metrics.

## Iteration 1 (Post-Rewrite Baseline — 2026-11-26)

| Category | Score | Evidence & Gaps |
| --- | :---: | --- |
| **Modularity and extensibility** | **9/10** | `FeatureModule` + `FeatureRegistry` (`src/core/feature-registry.ts`), isolated feature folders (`recorder`, `filler`, `profiles`, `portability`, `_example-template`), zero cross-feature imports. **Gap:** No automated test asserting zero cross-feature imports and strict layer boundaries. |
| **Readability** | **9/10** | TypeScript `strict: true`, ESLint 0 errors / 0 warnings, Prettier 100% pass. **Gap:** `src/ui/popup/popup.ts` (295 lines) bundles profile-bar management and main controller in one function. |
| **Contributor onboarding** | **8/10** | `README.md`, `CONTRIBUTING.md`, `docs/ARCHITECTURE.md` (with Mermaid diagrams + glossary), `_example-template/`, `.githooks/pre-commit`, CI workflow, issue/PR templates. **Gap:** `README.md` does not yet embed UI screenshots; `npm audit` shows 4 devDependency vulnerabilities. |
| **Efficiency** | **9/10** | Measured via `npm run budgets`: 0 runtime deps; Chromium unpacked 104.80 KB (zip 50.66 KB), Firefox unpacked 105.11 KB (xpi 50.75 KB); `background.js` 9.74 KB, `record.js` 4.19 KB, `fill.js` 4.90 KB; minimal permissions `[activeTab, scripting, storage]`. **Gap:** No automated latency budget assertions in `test:e2e`. |
| **Technique choices** | **10/10** | 6 ADRs (`docs/decisions/001`–`006`) each evaluating concrete alternatives with size, security, and maintainability evidence. |
| **Features** | **9/10** | All v2.0 features preserved/fixed + multi-profile, Shadow DOM, smart matching, sensitive-field protection, Options manager. **Gap:** Popup duplicates the exact same "Unsupported page" string in both `#statusBar` and `#fieldList`. |
| **Icon** | **9/10** | Custom vector `assets/icons/icon.svg` + 16/32/48/96/128/512 PNG exports inspected visually at 16, 32, 48, 128, and 512 px. **Gap:** No light/dark toolbar contrast preview verification artifact yet. |
| **Browser compatibility** | **8/10** | Real Brave/Chromium MV3 E2E passed (`popup=103.3ms`, `record=35.0ms`, `fill=8.3ms`, 0 console errors); Firefox MV3 manifest + XPI verified (`Mozilla Firefox 161.0`). **Gap:** `src/platform/browser.ts` lacks direct unit tests for both `chrome.*` and `browser.*` API surfaces; Firefox build lacks runtime verification of `__BUILD_TARGET__ === "firefox"` behavior. |
| **Security and privacy** | **8/10** | Minimal permissions, strict CSP (`script-src 'self'; object-src 'self'; style-src 'self'`), ESLint bans `innerHTML`, prototype-safe import, safe-by-default password/CVV/OTP/CAPTCHA/CSRF exclusion. **Gap:** `npm audit` flags 4 devDep vulnerabilities (`vitest`, `happy-dom`, `tinypool`); dark-mode screenshots caught mid-transition button colors. |
| **Testing and reliability** | **8/10** | 6 unit test suites (28/28 passing) + Chromium E2E smoke test passing. **Gap:** Missing unit tests for `src/platform/browser.ts`, architecture invariants, and end-to-end profile/popup flows. |

**Iteration 1 Total:** 87 / 100  
**Lowest 3 categories targeted for Iteration 2:**
1. **Security and privacy (8/10)** — Eliminate all `npm audit` vulnerabilities to 0; fix dark-mode screenshot timing and verify dark-mode button contrast visually.
2. **Browser compatibility (8/10)** — Add `tests/unit/platform-browser.test.ts` covering both `chrome.*` and `browser.*` adapters and verify Firefox target bundle behavior in E2E.
3. **Contributor onboarding & Testing (8/10)** — Embed clean light/dark UI screenshots (showing populated popup with profiles & fields + options page) in `README.md`, fix duplicate unsupported-page copy, and add `tests/unit/architecture.test.ts`.
