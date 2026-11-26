# ADR 007: Closed Shadow DOM, Iframes, Context Menus, and Direct Global Hotkeys

- **Status:** Accepted
- **Date:** 2026-11-26

## Context

After v3.0.0 reached 10/10 on our initial baseline, three real-world workflow limitations remained:

1. **Closed Shadow DOM** (`attachShadow({ mode: 'closed' })`) inputs were skipped because `el.shadowRoot` returns `null`.
2. **Embedded iframes** (same-origin and cross-origin) were skipped because script injection targeted only the top frame.
3. **Direct global hotkeys (`Alt+Shift+F` / `Alt+Shift+R`) and one-click page actions** without opening the popup were unavailable because custom MV3 `commands` do not grant `activeTab` on Chromium.

We want to overcome all three limitations **without** regressing our privacy-first posture (zero install-time `<all_urls>` host permissions).

## Options Considered

| Capability                 | Option A (Broad Install Permissions)                                 | Option B (Progressive / Zero-Install-Warning Strategy)                                                                                                                                                            | Verdict      |
| -------------------------- | -------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ |
| **Closed Shadow DOM**      | Page-world monkey-patching of `attachShadow` (invasive, CSP-hostile) | Extension-only isolated-world APIs: `chrome.dom.openOrClosedShadowRoot(el)` (Chromium 88+) & `el.openOrClosedShadowRoot` (Firefox 63+) — **0 extra permissions**                                                  | **Option B** |
| **Iframes**                | Request `<all_urls>` at install time                                 | Enable `allFrames: true` (covers same-origin iframes with **0 extra permissions**) + `optional_host_permissions` (`optional_permissions` on Firefox) for opt-in cross-origin iframes                              | **Option B** |
| **No-Popup Fill & Record** | Request `<all_urls>` at install time                                 | Combine `contextMenus` (**0 install warnings**, automatically grants `activeTab` on click) + per-site opt-in `permissions.request({ origins: [origin + '/*'] })` for direct `Alt+Shift+F` / `Alt+Shift+R` hotkeys | **Option B** |

## Decision

1. **Closed Shadow DOM (`src/platform/shadow-root.ts`):** Isolated inside `src/platform/` so no `chrome.*` global leaks into `src/core/` or `src/features/`. Automatically traverses both open and closed shadow roots during record and fill.
2. **Frame-Aware Multi-Frame Record & Fill:**
   - `BrowserAdapter.executeFileAndCallFrames(..., allFrames)` injects into accessible frames and returns sorted frame results.
   - Subframe fields record deterministic `locator.frameOrigin` and `locator.framePath`; on fill, each frame handles only its matching fields and reports `matchedIndices` so multi-frame fill counts and unmatched labels are aggregated accurately with zero double-counting.
3. **Context Menus (`contextMenus` permission):**
   - Registers _Snappy Form Filler → Fill Form / Record Form_ on `onInstalled`.
   - Degrades gracefully when `contextMenus` is absent (e.g., Firefox for Android).
   - Grants `activeTab` automatically on click with zero host permissions.
4. **Direct Global Hotkeys (`Alt+Shift+F` / `Alt+Shift+R`) via Optional Host Permissions:**
   - Chromium manifest declares `optional_host_permissions: ["<all_urls>"]`; Firefox manifest declares `optional_permissions: ["<all_urls>"]`.
   - Install-time host permissions remain **none**.
   - Users can opt in **per site** via the popup's `Hotkeys: Off / On` toggle (`permissions.request({ origins: [origin + '/*'] })`) or globally via Settings, and revoke at any time.
   - Direct actions flash a brief toolbar badge (`6`, `R6`, or `!`) so users get immediate feedback without opening the popup.

## Trade-offs

- Adds `contextMenus` to `permissions` (triggers zero browser install warnings and zero host access).
- `background.js` grows slightly (~9.75 KB → ~13 KB minified) to wire `commands` and `contextMenus` via the shared `recordActiveTab` / `fillActiveTab` services, still staying completely event-driven with zero timers or idle RAM overhead and well within our 16 KB background budget.
- Cross-origin iframes and Chromium direct global hotkeys require an explicit one-time user opt-in click (per-site or global) so users who prefer zero host access never grant it.
