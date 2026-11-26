# Snappy Form Filler — Feature Specification & Rationale

Every feature in v3.0 is strictly aligned with the extension's purpose: **fast, reliable, local-first recording and framework-aware replaying of web form data across any website**.

## Retained & Polished Features (from v2.0)

| Feature                            | v2.0 State                                                                                                       | v3.0 Upgrade                                                                                                                                                                                                                                                                                                                        | Rationale                                                                                                         |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| **Record active page form fields** | Works on basic inputs; drops `<select multiple>`, misses unnamed inputs and Shadow DOM, silently saves passwords | Multi-strategy field capture (ID, name, `data-testid`, `aria-label`, `<label>`, CSS path, occurrence index), `<select multiple>` array values, open Shadow DOM traversal, safe-by-default sensitive-field skipping with clear skip counts                                                                                           | Eliminates silent failure on modern SPA forms and protects user credentials.                                      |
| **Framework-aware Fill**           | Crashes with `ReferenceError: fieldLabel` on any unmatched field; misses React checkbox/select setters           | Self-contained bundled filler script; native setters for `HTMLInputElement.value`, `HTMLInputElement.checked`, `HTMLTextAreaElement.value`, `HTMLSelectElement.value`, plus React `_valueTracker` reset and `input`/`change`/`blur` events; graceful skip of `disabled`/`readOnly` inputs; detailed filled/skipped/unmatched report | Fixes the #1 crash in v2.0 and ensures reliable filling in React 16–19, Vue 3, Angular, Svelte, and vanilla HTML. |
| **Inline Field Editor**            | Broken `contentEditable` divs for checkboxes/radios; Enter injects HTML                                          | Native `<input>` text controls (Enter saves, Escape reverts), interactive checkbox/radio toggles, password masking with reveal toggle, accessible delete button with `aria-label`, and inline "Add field" support                                                                                                                   | Makes editing recorded profiles reliable and keyboard-accessible.                                                 |
| **Clear Site & Clear All**         | `Clear Site` mutated `profiles[null]` on restricted pages; `Clear All` used `window.confirm()`                   | Guarded by valid origin check; non-blocking inline confirmation bar (no `window.confirm()`)                                                                                                                                                                                                                                         | Prevents accidental data loss and Firefox popup dismissal.                                                        |
| **Export & Import JSON**           | `Cancel` wiped all data; broken in Firefox popup; weak validation                                                | Explicit 3-way choice (**Merge** / **Replace** / **Cancel**); strict schema + prototype-pollution validation; supports importing both v2.0 and v3.0 JSON formats; delayed `URL.revokeObjectURL`; Firefox popup routes Import cleanly to full-page Profile Manager                                                                   | Fixes critical data-loss and Firefox compatibility bugs while keeping backwards compatibility with v2.0 backups.  |

## New Features (Directly Tied to Extension Purpose)

### 1. Multiple Named Profiles per Origin

- **Rationale:** The extension's description explicitly promises _"Per-site profiles"_. Developers and QA testers frequently test multiple personas or workflows on the same origin (e.g., `http://localhost:3000` with "Admin User", "Expired Trial", and "Validation Edge Case" profiles).
- **Behavior:** Each origin starts with a `"Default"` profile (preserving one-click Record/Fill ergonomics from v2.0). Users can create, switch, rename, duplicate, or delete profiles per site directly in the popup or Profile Manager.
- **Backwards Compatibility:** Existing v2.0 `profiles[origin]` data is automatically migrated to the `"Default"` profile on upgrade.

### 2. Smart Multi-Strategy Field Matching + Open Shadow DOM

- **Rationale:** Modern component libraries (MUI, Radix, Chakra, Tailwind/Headless UI, Shoelace/Web Components) often omit `name` or use dynamic IDs (`:r1:`). Matching only by `id` and `name` fails frequently on real-world apps.
- **Behavior:** Recorder captures stable match signals in priority order:
  1. Stable `id` (skipping auto-generated patterns like `:r0:`, `mui-123`, `ember123` as primary if better signals exist, still usable as fallback)
  2. `name` (+ `value` for radios/checkboxes, or occurrence index for duplicate names like `items[]`)
  3. `data-testid` / `data-test` / `data-cy`
  4. `aria-label` or associated `<label>` text + `type`
  5. `placeholder` + `type`
  6. Deterministic CSS path fallback
     Also walks open Shadow DOM roots (`el.shadowRoot`) during both recording and filling.

### 3. Sensitive-Field Protection (Safe by Default)

- **Rationale:** Prevents accidental plaintext storage/export of passwords, credit card CVVs, OTPs, CAPTCHAs, and CSRF tokens.
- **Behavior:** Skips passwords and sensitive fields by default and reports `"Recorded 8 fields (2 sensitive skipped)"`. Users who deliberately test login forms on staging can opt in via Settings (`skipPasswords: false`), with values masked in the UI.

### 4. Full-Page Profile Manager & Settings (`options.html`)

- **Rationale:** Solves two real problems at once: (a) Firefox closes popups whenever `<input type="file">` opens, making full-page import mandatory for reliable Firefox support; (b) users with profiles across many sites need a clean place to search, inspect, export/import, and configure settings without a 360 px popup constraint.
- **Zero extra permissions:** Registered via standard MV3 `options_ui` (`open_in_tab: true`).

### 5. Subtle In-Page Fill Feedback

- **Rationale:** On long forms, users want immediate visual confirmation of which fields were filled vs missed without leaving any artifacts in the page DOM.
- **Behavior:** Optionally (configurable via `highlightFilled: true`) applies a brief ~900 ms emerald outline transition directly via inline style restoration (restoring exact prior inline `outline`/`transition` values afterward — zero injected `<style>` tags or lingering attributes).

### 6. Keyboard-First Popup UX & Automatic Dark/Light Theme

- **Rationale:** Power users open the popup with `Alt+Shift+S` (`_execute_action`) and expect instant execution without reaching for the mouse, and expect the extension to match their browser's light or dark theme with crisp contrast.
- **Behavior:** Pressing `R` (Record) or `F` (Fill) when no text input is focused triggers immediately; full keyboard tab navigation; semantic CSS tokens honoring `prefers-color-scheme: dark`.

## Explicitly Out of Scope (Not Added)

- **Cloud sync / user accounts:** Conflicts with privacy-first local storage and requires external infrastructure.
- **Auto-fill on page load:** Would require automatic injection without user action, exposing form data to unintended pages.

## Progressive Opt-In Capabilities (Added in v3.0 — ADR 007)

- **Closed Shadow DOM:** Handled automatically with zero extra permissions via `chrome.dom.openOrClosedShadowRoot` (Chromium 88+) and `el.openOrClosedShadowRoot` (Firefox 63+) isolated in `src/platform/shadow-root.ts`.
- **Same-origin & Opt-In Cross-origin Iframes:** Same-origin iframes work automatically under `activeTab` (`allFrames: true`) with frame-scoped `frameOrigin`/`framePath` locators and accurate cross-frame aggregation. Cross-origin iframes are enabled only when the user opts into `optional_host_permissions` in Settings.
- **Right-Click Context Menu & Direct Global Hotkeys (`Alt+Shift+F` / `Alt+Shift+R`):** Context menu actions work on any page without host permissions (degrading gracefully on Firefox for Android). Direct global hotkeys work immediately on sites where the user clicks `Hotkeys: On` in the popup (per-origin `permissions.request`) or enables optional global access in Settings, flashing a brief toolbar badge (`6`, `R6`, or `!`).
