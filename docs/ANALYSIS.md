# Snappy Form Filler — Codebase Analysis (Phase 0)

> Baseline audit of commit `fb02205` (version `2.0`) prior to the rewrite. Every file in the repository (`manifest.json`, `popup.html`, `popup.js`, `recorder.js`) was read line by line.

## 1. Purpose

**What it does:** Snappy Form Filler is a lightweight Manifest V3 browser extension that records the current values of HTML form controls (`<input>`, `<select>`, `<textarea>`) on the active web page, stores them locally per site origin, lets users inspect/edit/export/import saved values, and replays them back into forms using framework-aware value setters (React, Vue, Angular).

**Who it is for:** Developers, QA engineers, and power users who repeatedly fill complex or multi-field web forms across staging environments, local dev servers, admin portals, or recurring web workflows.

**Problem it solves:** Native browser autofill is limited to standard identity/address/payment fields and breaks on custom business forms, test personas, or SPA inputs backed by synthetic event systems. Snappy Form Filler provides on-demand, explicit snapshot-and-replay per origin without background tracking or cloud sync.

---

## 2. Architecture Map

The original repository contains **4 files** totaling **471 lines** with no build step, no tests, no icons, no background script, and no documentation.

| File            | Lines | Responsibility                                                                                                                                                                                                                      | Context                                                    |
| --------------- | ----: | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| `manifest.json` |    10 | MV3 extension metadata, permissions (`activeTab`, `scripting`, `storage`), popup entry point                                                                                                                                        | Browser                                                    |
| `popup.html`    |   123 | Popup markup + inline CSS styling for controls, status bar, and inline field list editor                                                                                                                                            | Extension Popup                                            |
| `popup.js`      |   312 | All extension logic: active tab origin lookup, `chrome.storage.local` persistence, DOM rendering, inline editing, script injection for recording & filling, JSON export/import, and the page-injected `frameworkAwareFill` function | Extension Popup (+ serialized function injected into Page) |
| `recorder.js`   |    26 | IIFE injected on demand via `chrome.scripting.executeScript` to scrape `input, select, textarea` elements and return a serialized array                                                                                             | Web Page (Isolated World)                                  |

### Data & Control Flow

```text
User clicks toolbar icon
  └─► popup.html loads popup.js
        ├─► Init (refresh)
        │     ├─► chrome.tabs.query({ active: true, currentWindow: true }) ─► URL(tab.url).origin
        │     └─► chrome.storage.local.get(['profiles']) ─► profiles[origin] ─► renderFields()
        │
        ├─► Click "Record"
        │     ├─► chrome.scripting.executeScript({ files: ['recorder.js'] })
        │     │     └─► Page Isolated World: querySelectorAll('input, select, textarea')
        │     │         └─► returns [{ id, name, type, value, checked? }]
        │     └─► chrome.storage.local.set({ profiles }) ─► renderFields()
        │
        ├─► Click "Fill"
        │     ├─► chrome.storage.local.get(['profiles']) ─► formData
        │     └─► chrome.scripting.executeScript({ func: frameworkAwareFill, args: [formData] })
        │           └─► Page Isolated World: finds elements by id/name, invokes native setters,
        │               dispatches input/change/blur events ─► returns unmatched[]
        │
        ├─► Inline edit / delete field ─► mutates in-memory array ─► chrome.storage.local.set({ profiles })
        ├─► Clear Site / Clear All ─► deletes origin key or removes 'profiles' key
        └─► Export / Import ─► Blob download / FileReader JSON parse ─► chrome.storage.local.set({ profiles })
```

**Storage schema (`chrome.storage.local`):**

```json
{
  "profiles": {
    "https://example.com": [
      { "id": "email", "name": "email", "type": "email", "value": "test@example.com" },
      { "id": "agree", "name": "agree", "type": "checkbox", "value": "on", "checked": true }
    ]
  }
}
```

**Messaging:** None. All page interaction uses one-shot `chrome.scripting.executeScript` return values. There is no background service worker and no persistent content script.

---

## 3. Feature Inventory

| Feature                      | How It Works                                                                                                                                                                                                              | Quality                                  | Notes                                                                                                                                                                                                                                                                                                                                     |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Per-site profile scoping** | Parses active tab URL via `new URL(tabs[0].url).origin` and keys `profiles` object by origin.                                                                                                                             | **Works (partial)**                      | Fails silently or acts on `null` origin on restricted pages (`chrome://`, `about:`). Only one profile per origin.                                                                                                                                                                                                                         |
| **Record form fields**       | Injects `recorder.js` into active tab; collects `input`, `select`, `textarea` excluding `button`, `submit`, `reset`, `hidden`, `file`, `image` and anything with `captcha` in `id`/`name`.                                | **Buggy / Incomplete**                   | Captures `type="password"` in plaintext! Loses `<select multiple>` selections. Records fields with neither `id` nor `name` (unfillable later). Misses open Shadow DOM.                                                                                                                                                                    |
| **Framework-aware fill**     | Injects `frameworkAwareFill` function with saved `formData`; resolves elements by `id` then `[name=...]`; uses native `HTMLInputElement`/`HTMLTextAreaElement` `.value` setters and dispatches `input`, `change`, `blur`. | **Buggy (Crash!)**                       | **Fatal bug at `popup.js:277`**: calls `fieldLabel(item)` inside the serialized injected function, but `fieldLabel` is not defined in page scope! Any unmatched field throws `ReferenceError` and aborts remaining fills. Missing native setters for `checked` and `HTMLSelectElement.value`.                                             |
| **Inline field editor**      | Renders saved fields in popup; `contentEditable` div updates `item.value` on `blur`; `×` button deletes a field.                                                                                                          | **Buggy / Incomplete**                   | Checkboxes and radios have `contentEditable = true` so users can type garbage into them, which is silently ignored on `blur` and cannot toggle `checked`. Pressing Enter injects HTML/newlines. No way to add fields or rename profiles.                                                                                                  |
| **Clear Site**               | Calls `saveSiteProfile([])` which deletes `profiles[currentOrigin]`.                                                                                                                                                      | **Buggy on edge cases**                  | Works on normal sites, but if `currentOrigin === null` (restricted page), runs `delete profiles[null]` and claims "Cleared".                                                                                                                                                                                                              |
| **Clear All**                | Uses `window.confirm()`, then `chrome.storage.local.remove(['profiles'])`.                                                                                                                                                | **Rough**                                | `window.confirm()` inside extension popups has poor UX and can dismiss/glitch the popup in Firefox and some Chromium builds.                                                                                                                                                                                                              |
| **Export JSON**              | Serializes `profiles` to a `Blob`, creates an object URL, clicks a temporary `<a download>`, and immediately calls `URL.revokeObjectURL(url)`.                                                                            | **Buggy (Cross-browser)**                | Synchronous `revokeObjectURL` right after `a.click()` can abort downloads in Firefox and slower environments before the browser reads the blob.                                                                                                                                                                                           |
| **Import JSON**              | Triggers hidden `<input type="file">`, reads via `FileReader`, parses JSON, validates top-level shape, prompts via `confirm()` to merge or replace.                                                                       | **Buggy (Critical UX + Firefox broken)** | 1. Clicking Cancel in `confirm()` **replaces all existing data** — there is no way to abort an import! 2. In Firefox, opening `<input type="file">` inside a popup immediately closes the popup, making import completely unusable. 3. Weak validation (no prototype-pollution guard, no origin/field schema checks, no file size limit). |

---

## 4. Tech Inventory

| Technology / API                                    | Where Used                | Reason Chosen                                                                                                     |
| --------------------------------------------------- | ------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Manifest V3 (`manifest_version: 3`)                 | `manifest.json`           | Current Chrome Web Store and Firefox AMO standard.                                                                |
| Vanilla JavaScript (ES6+, IIFE, callbacks)          | `popup.js`, `recorder.js` | Zero build step, minimal initial complexity.                                                                      |
| Vanilla HTML + inline `<style>`                     | `popup.html`              | Simple single-view popup with zero dependencies.                                                                  |
| `chrome.tabs.query` + `activeTab`                   | `popup.js`                | Read active tab ID and URL without broad `tabs` or host permissions.                                              |
| `chrome.scripting.executeScript`                    | `popup.js`                | On-demand script injection (no always-on content scripts, zero background CPU/RAM).                               |
| `chrome.storage.local`                              | `popup.js`                | Local-only persistence (5–10 MB quota, never synced to cloud).                                                    |
| `Object.getOwnPropertyDescriptor(..., 'value').set` | `popup.js:260-261`        | Bypass React's overridden `.value` setter so synthetic `input`/`change` events update controlled component state. |
| `CSS.escape()`                                      | `popup.js:267`            | Safely escape field `name` attribute values in `querySelectorAll`.                                                |
| `Blob` + `URL.createObjectURL` + `FileReader`       | `popup.js:207-250`        | Client-side JSON export/import without extra permissions (e.g. `downloads`).                                      |
| `window.confirm()`                                  | `popup.js:196, 239`       | Quick confirmation dialogs without building custom modal UI (unclear if Firefox popup impact was known).          |
| `contentEditable`                                   | `popup.js:81`             | Quick inline editing without `<input>` styling (unclear why `<input>` was avoided; introduces multiple bugs).     |

---

## 5. Problems Found

### Critical Bugs

1. **Page-context crash on any unmatched field (`popup.js:277`):** `frameworkAwareFill` is serialized and injected into the active tab via `executeScript({ func })`. Line 277 calls `fieldLabel(item)`, which is declared outside `frameworkAwareFill` in `popup.js`. Whenever any saved field is missing on the page, `ReferenceError: fieldLabel is not defined` is thrown, aborting the rest of the fill operation.
2. **Import Cancel wipes all existing data (`popup.js:239-240`):** `confirm('Merge with existing data?\n\nOK = merge...\nCancel = replace all')` maps `Cancel` to `replace all`, giving the user no way to cancel an accidental import.
3. **Firefox popup closes on file import (`popup.html:118`, `popup.js:218`):** Opening a native file picker via `<input type="file">` inside an extension popup dismisses the popup in Firefox before the `change` event can fire.
4. **Synchronous `URL.revokeObjectURL` after `a.click()` (`popup.js:212-213`):** Can race with download initiation and fail in Firefox/Safari/slow disks.
5. **Checkbox/radio rows editable as text and un-toggleable (`popup.js:81-91`):** Sets `contentEditable = true` on checkbox/radio items; edits corrupt the displayed text while `blur` silently discards them.
6. **Unchecked `tabs[0]` and `chrome.runtime.lastError` (`popup.js:19-26, 130-185`):** Restricted tabs or empty tab query results cause uncaught errors or silent failures.
7. **Null origin mutation on Clear Site (`popup.js:48-58, 188-193`):** Clicking Clear Site when `currentOrigin` is `null` executes `delete profiles[null]` and displays "Cleared".
8. **`<select multiple>` values lost (`recorder.js:19`, `popup.js:291-292`):** Only reads/sets a single `.value`, discarding multi-select options.
9. **Unnamed/ID-less fields recorded but permanently unfillable (`recorder.js:9-13`, `popup.js:264-277`):** Modern SPA inputs lacking `id` and `name` (using `aria-label`, `placeholder`, `data-testid`, or `<label>`) are recorded as `{ id: null, name: null }` and always fail to match.
10. **Duplicate `name` inputs collapse to `els[0]` (`popup.js:273`):** Multiple non-radio/checkbox inputs sharing a `name` (e.g., `name="tag[]"`) overwrite the first element repeatedly.
11. **Incomplete React/Vue/Angular setter coverage (`popup.js:260-299`):** Native setters are used for `HTMLInputElement.value` and `HTMLTextAreaElement.value`, but NOT for `HTMLInputElement.checked` or `HTMLSelectElement.value`, and React's internal `_valueTracker` is not reset cleanly for checkboxes/radios.

### Security & Privacy Issues

12. **Plaintext password recording (`recorder.js:6`):** `type="password"` inputs are NOT excluded from recording, causing passwords to be silently captured in plaintext in `chrome.storage.local` and exported in unencrypted JSON files. Sensitive tokens (CSRF, OTP, CVV) are also captured.
13. **DOM/HTML injection in `setStatus` (`popup.js:31-33`):** `statusBar.innerHTML = '<span>' + msg + '</span>'` interpolates untrusted strings (such as keys from an imported JSON file in error messages at line 247) directly into `innerHTML`.
14. **Prototype pollution & unvalidated import payload (`popup.js:226-240`):** `JSON.parse` output is spread into `profiles` without rejecting `__proto__`, `constructor`, `prototype`, invalid origin keys, invalid field shapes, or oversized payloads.
15. **Inline `<style>` in `popup.html`:** Prevents adopting a strict `style-src 'self'` CSP.

### Dead Code & Duplication

16. **Duplicate `fieldLabel` declaration (`popup.js:60-62` and `popup.js:306-308`):** Exact same function declared twice in the same closure.
17. **Dead `statusTimeout` variable (`popup.js:16, 30`):** Checked and cleared with `clearTimeout`, but `setTimeout` is never called anywhere.
18. **Duplicate `tabs.query` calls (`popup.js:130, 143, 157, 166`):** `recordBtn` and `fillBtn` each query the active tab twice in a single click instead of reusing the already-fetched tab object.

### Cross-Browser & Packaging Gaps

19. **Chrome-only API usage:** Direct `chrome.*` callback calls throughout `popup.js`; no `browser.*` / Promise abstraction layer.
20. **Missing Firefox MV3 manifest fields:** No `browser_specific_settings.gecko` (or `gecko_android` for Firefox for Android).
21. **Missing extension icons:** No `icons` or `action.default_icon` in `manifest.json`.
22. **No automated tests, linter, formatter, build system, CI, or contributor docs.**

### Accessibility & UX Gaps

23. **Missing document metadata:** `popup.html` lacks `<html lang="en">`, `<meta charset="utf-8">`, and `<title>`.
24. **WCAG AA contrast failures:** `.site-info` (`#888`), `.field-type` (`#aaa`), `.field-del` (`#ccc`), `.empty-msg` (`#aaa`), and `#clearAllBtn` (white text on `#ff9800`) all fail the 4.5:1 contrast ratio.
25. **Missing ARIA semantics:** No `role="status"` / `aria-live="polite"` on status bar, no `aria-label` on `×` delete buttons, skipped heading levels (`<h3>` with no `<h1>`), `outline: none` on focused field editor.
26. **No dark theme support:** Hardcoded light palette ignores OS/browser `prefers-color-scheme: dark`.
27. **Single profile per origin:** No way to store multiple test personas or separate forms on the same origin (e.g., `localhost:3000`).

### Permission Review

- Current permissions: `["activeTab", "scripting", "storage"]`.
- **Verdict:** Already minimal and exemplary. No host permissions (`<all_urls>`), no `tabs`, no `cookies`, no `webRequest`. The rewrite **must preserve this exact minimal permission set**.

---

## 6. Open Questions & Stated Assumptions

1. **Password fields in developer/QA workflows:**
   - _Question:_ Should password fields be completely blocked or opt-in?
   - _Assumption:_ Exclude `type="password"` (plus CSRF, CAPTCHA, CVV, OTP fields) **by default** for safety, and provide an explicit, opt-in setting ("Allow recording password fields") with masked display in the UI for QA/dev users testing staging forms.
2. **Multiple profiles per origin & v2.0 backwards compatibility:**
   - _Question:_ Should the extension remain single-profile-per-origin or support named profiles per origin?
   - _Assumption:_ Support multiple named profiles per origin (defaulting to a `"Default"` profile so one-click Record/Fill remains identical to v2.0), while automatically migrating existing v2.0 `profiles[origin] = Field[]` storage data and continuing to accept v2.0 JSON files on import.
3. **Browser support & Firefox for Android:**
   - _Question:_ Should Firefox for Android be supported?
   - _Assumption:_ Yes — our minimal permission set (`activeTab`, `scripting`, `storage`), MV3 manifest with `browser_specific_settings.gecko_android`, and responsive popup/options CSS make Firefox for Android support clean with zero extra overhead.
4. **Branding & Version:**
   - _Question:_ Should the name and green visual identity be preserved?
   - _Assumption:_ Preserve "Snappy Form Filler" and evolve its emerald-green brand identity (`#00803e` -> refined accessible emerald palette) with a crisp new SVG icon set; bump version to `3.0.0` for the full rewrite.
