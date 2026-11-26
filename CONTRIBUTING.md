# Contributing to Snappy Form Filler

Welcome! This guide gets you from a fresh clone to shipping your first tested pull request in under an hour.

## 1. One-Command Setup

Prerequisites: **Node.js >= 20** and **Git**. (Optional: `rsvg-convert` if you plan to edit `assets/icons/icon.svg`.)

```bash
git clone https://github.com/mehad605/SnappyFormFiller.git
cd SnappyFormFiller
npm install
```

`npm install` automatically wires `.githooks/pre-commit`, which runs lint, typecheck, and unit tests before every commit.

## 2. Development Workflow

1. Start watch mode (rebuilds both Chromium and Firefox targets in < 50 ms on save):
   ```bash
   npm run dev
   ```
2. Create a focused feature branch:
   ```bash
   git checkout -b feat/my-improvement
   ```
3. Run the full verification suite before opening a PR:
   ```bash
   npm run check
   npm run test:e2e
   ```

## 3. Loading the Unpacked Extension

### Chromium (Chrome, Edge, Brave, Opera, Vivaldi, Arc)

1. Run `npm run build:chromium` (or `npm run dev:chromium`).
2. Navigate to `chrome://extensions` (or `edge://extensions` / `brave://extensions`).
3. Toggle **Developer mode** ON (top right).
4. Click **Load unpacked** and select the `dist/chromium` directory.
5. After code changes, click the **Reload (↻)** icon on the extension card.

### Firefox (Desktop)

1. Run `npm run build:firefox` (or `npm run dev:firefox`).
2. Navigate to `about:debugging#/runtime/this-firefox`.
3. Click **Load Temporary Add-on…** and select `dist/firefox/manifest.json`.
4. After code changes, click **Reload** next to Snappy Form Filler on `about:debugging`.

## 4. Debugging Tips

| Context                                        | Chromium                                                    | Firefox                                                                                                                         |
| ---------------------------------------------- | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| **Popup UI**                                   | Right-click inside the open popup → **Inspect**             | `about:debugging` → **Inspect** → switch iframe selector to `popup.html` (enable _Disable Popup Auto-Hide_ in Toolbox `⋯` menu) |
| **Options / Manager**                          | Open Manage page → right-click → **Inspect**                | Open Manage page → `F12`                                                                                                        |
| **Background Worker**                          | `chrome://extensions` → click **service worker** link       | `about:debugging` → click **Inspect**                                                                                           |
| **Injected Scripts (`record.js` / `fill.js`)** | DevTools on the target web page → Sources → Content scripts | DevTools on the target web page → Debugger                                                                                      |

## 5. How to Add a New Feature (Step by Step)

Snappy Form Filler uses a modular `FeatureModule` plugin architecture. You do **not** need to touch `popup.ts`, `background/index.ts`, or `platform/browser.ts` to add a feature:

1. **Copy the template folder:**
   ```bash
   cp -r src/features/_example-template src/features/my-feature
   ```
2. **Edit `src/features/my-feature/index.ts`:**
   - Give your module a unique `id`, `name`, and `description`.
   - Declare `popupActions` (buttons automatically rendered in `primary`, `secondary`, or `utility` slots) and/or `backgroundHandlers` (message routes registered in the background worker).
3. **Register it in `src/features/index.ts`:**
   ```ts
   import { createMyFeature } from './my-feature';
   // Inside createFeatureRegistry:
   registry.register(createMyFeature(deps.storage));
   ```
4. **Write unit tests** in `tests/unit/my-feature.test.ts` using `createMockBrowser()` from `tests/helpers/mock-browser.ts`.
5. **Run `npm run check`** to verify lint, TypeScript strict mode, Prettier formatting, tests, and bundle budgets.

## 6. Coding Standards

- **Platform boundary:** Never call `chrome.*` or `browser.*` outside `src/platform/browser.ts` (enforced by ESLint).
- **XSS safety:** Never assign to `innerHTML`, `outerHTML`, or call `insertAdjacentHTML` in `src/` (enforced by ESLint). Use `createEl()` and `textContent` from `src/ui/shared/dom.ts`.
- **No cross-feature imports:** Features under `src/features/<name>/` may import from `src/core/` only, never from sibling feature folders.
- **No extra permissions without an ADR:** Our permission set (`activeTab`, `scripting`, `storage`) is intentionally minimal. Any new permission requires a decision record in `docs/decisions/`.
- **Small, typed functions:** Keep TypeScript `strict` clean with zero `any` and zero lint warnings.

## 7. Good First Issues

Looking for a well-scoped first PR? Try one of these:

1. **Add "Duplicate Profile" button to the Popup bar** — `StorageRepository.duplicateProfile()` is already implemented and tested in `src/core/storage.ts`; expose it in `src/ui/popup/` with a unit test.
2. **Add "Copy Profile as JSON" feature module** — Copy `src/features/_example-template/`, copy the active profile's JSON to `navigator.clipboard.writeText()`, and register it in `src/features/index.ts`.
3. **Add keyboard shortcut hint tooltip on hover** — Show `Record (R)` / `Fill (F)` tooltips on primary buttons in `src/ui/popup/popup.ts`.
4. **Add "Export single site" button in Options UI** — Reuse `createExportBundle` in `src/ui/options/options.ts` filtered to one origin.
5. **Add drag-and-drop JSON import zone in Options UI** — Allow dropping a `.json` backup file onto the Import card in `src/ui/options/options.ts`.
