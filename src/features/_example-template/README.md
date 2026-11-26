# Feature Module Template

This folder is a working, type-checked template showing how to add a new feature to Snappy Form Filler without modifying unrelated modules.

## How to Add a New Feature (5 Steps)

1. **Copy this folder** to `src/features/<your-feature>/`.
2. **Rename** the factory function and `id` (e.g., `createMyFeature`, `id: 'my-feature'`).
3. **Choose your extension points** on the returned `FeatureModule`:
   - `popupActions`: buttons rendered automatically into the popup (`primary`, `secondary`, or `utility` slot).
   - `backgroundHandlers`: message handlers automatically registered in the event-driven background worker.
4. **Register your feature** in `src/features/index.ts` (2 lines: import + `registry.register(...)`).
5. **Add unit tests** in `tests/unit/<your-feature>.test.ts` using `createMockBrowserAdapter()` from `tests/helpers/mock-browser.ts`.

## Architectural Rules

- Never reference `chrome.*` or `browser.*` directly — ESLint enforces using `BrowserAdapter` from `src/platform/browser.ts` (passed through `ctx.browser` or `StorageRepository`).
- Never import from another folder inside `src/features/*` — shared utilities belong in `src/core/`.
- Never assign to `innerHTML` — use `textContent` and helpers from `src/ui/shared/dom.ts`.
