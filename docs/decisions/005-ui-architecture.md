# ADR 005: UI Architecture (Vanilla TypeScript vs UI Framework)

- **Status:** Accepted
- **Date:** 2026-11-26

## Context

Snappy Form Filler has two UI surfaces:

1. **Popup (`popup.html`)** — compact 360 px action surface for rapid Record, Fill, profile switching, inline field editing (text, select, checkbox/radio toggle), Clear, and quick Export/Import.
2. **Profile Manager / Options (`options.html`)** — full-page view for searching/managing profiles across all sites, reliable cross-browser JSON Import/Export (critical on Firefox where file pickers dismiss popups), and extension settings.

We must choose between a UI framework (React, Preact, Svelte, Lit) and modular Vanilla TypeScript with semantic CSS.

## Options Considered

| Option                                         | Added Bundle Size (gzip) | Build Complexity                | Startup Latency | XSS Safety                                              |
| ---------------------------------------------- | -----------------------: | ------------------------------- | --------------- | ------------------------------------------------------- |
| **React + ReactDOM**                           |                   ~45 KB | High (JSX, reconciler)          | ~20–40 ms       | High                                                    |
| **Preact**                                     |                  ~4.5 KB | Medium (JSX transform)          | ~5–10 ms        | High                                                    |
| **Svelte**                                     |                  ~3–6 KB | Medium (Svelte compiler plugin) | ~5 ms           | High                                                    |
| **Vanilla TypeScript + tiny `dom.ts` builder** |              **~0.5 KB** | **None (plain `.ts`)**          | **< 2 ms**      | **High (`textContent`-only helpers, zero `innerHTML`)** |

## Decision

Use **Vanilla TypeScript + a tiny typed DOM helper (`src/ui/shared/dom.ts`) + external CSS with design tokens (`src/ui/shared/tokens.css`)**.

### Justification & Evidence

1. **Zero framework runtime overhead:** Keeps the entire popup JS bundle well under 25 KB minified (~7 KB gzipped) and opens instantaneously (< 5 ms render).
2. **Strict CSP & XSS safety by construction:** `dom.ts` builds nodes via `document.createElement` and assigns text exclusively via `textContent`. ESLint flags any `innerHTML` / `outerHTML` usage.
3. **Accessible, native controls replace buggy `contentEditable`:**
   - Text/select/number/date fields render real `<input>` elements with proper `aria-label`s, Enter-to-save, Escape-to-revert, and masked display for password fields.
   - Checkbox and radio fields render real interactive toggle `<input type="checkbox">` controls rather than broken `contentEditable` divs.
   - Destructive confirmations (Clear All, Import Merge/Replace/Cancel) use inline non-blocking confirmation banners/dialogs instead of `window.confirm()`, completely eliminating the v2.0 "Cancel deletes all data" bug and Firefox popup dismissal issues.
4. **Automatic light/dark theme + WCAG AA contrast:** All colors are defined as semantic CSS custom properties in `tokens.css` with `@media (prefers-color-scheme: dark)` overrides and verified >= 4.5:1 text contrast.

## Trade-offs

- Complex state-heavy UIs (e.g., drag-and-drop kanban boards) would benefit from a framework's diffing. Our UI renders simple flat lists (typically 5–50 fields), where targeted DOM rendering is faster, simpler to debug, and zero-dependency.
