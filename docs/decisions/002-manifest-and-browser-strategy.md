# ADR 002: Manifest Strategy and Cross-Browser Support

- **Status:** Accepted
- **Date:** 2026-11-26

## Context

The extension must run on all Chromium-based browsers (Chrome, Edge, Brave, Opera, Vivaldi, Arc) and Firefox (Desktop and Firefox for Android). While both ecosystems use Manifest V3, their manifests differ in specific keys:

- **Background execution:** Chromium MV3 requires `background.service_worker`. Firefox MV3 historically preferred `background.scripts` (event pages) and has fuller support for `background.scripts` across Firefox Desktop >= 109 and Firefox for Android >= 120.
- **Extension ID & minimum versions:** Firefox requires `browser_specific_settings.gecko` (and `gecko_android` for mobile) for stable `storage.local` persistence and AMO submission; Chromium rejects unknown `browser_specific_settings` warnings in some tooling.
- **Icons:** Firefox recommends 48 px and 96 px icons; Chromium recommends 16, 32, 48, and 128 px.

## Options Considered

| Option                                                                 | Pros                                                                                 | Cons                                                                                                                                                       |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Single shared `manifest.json`**                                      | Only one file to maintain                                                            | Triggers browser warnings on unsupported keys (`service_worker` vs `scripts`, `browser_specific_settings` on Chrome, `minimum_chrome_version` on Firefox). |
| **Two manually maintained manifests**                                  | Browser-clean manifests                                                              | Version numbers, permissions, and descriptions drift out of sync.                                                                                          |
| **Single base definition + target generator (`scripts/manifest.mjs`)** | Zero drift; strict per-target validation; clean manifests with zero browser warnings | Small generator module in `scripts/`.                                                                                                                      |

## Decision

Generate target-specific MV3 manifests from a single source of truth (`scripts/manifest.mjs`), producing:

- `dist/chromium/manifest.json` (`npm run build:chromium`)
- `dist/firefox/manifest.json` (`npm run build:firefox`)

### Permission Budget (Non-Negotiable)

Both targets request **only**:

- `activeTab` — grants temporary access to the currently active tab _only_ when the user explicitly clicks the toolbar button or triggers `_execute_action`. Zero persistent host permissions (`<all_urls>` is never requested).
- `scripting` — injects the self-contained recorder and filler scripts on demand into the active tab.
- `storage` — persists profiles and settings locally in `storage.local`.

### Content Security Policy

Both targets explicitly declare:

```json
"content_security_policy": {
  "extension_pages": "script-src 'self'; object-src 'self'; style-src 'self'"
}
```

All inline `<style>` and `<script>` blocks are eliminated.

### Platform Degradation & Differences

| Capability                            | Chromium                                                          | Firefox Desktop                                                                                                                                 | Firefox for Android                                  |
| ------------------------------------- | ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| Background                            | `service_worker` (ES module)                                      | `scripts` (non-persistent event page)                                                                                                           | `scripts` (non-persistent event page)                |
| File import in popup                  | Works via hidden `<input type="file">`, also available in Options | Popup closes when OS file picker opens -> popup "Import" button detects Firefox and opens the full-page Profile Manager (`options.html#import`) | Opens full-page Profile Manager tab (`options.html`) |
| Keyboard shortcut (`_execute_action`) | Supported (`Alt+Shift+S`)                                         | Supported (`Alt+Shift+S`)                                                                                                                       | Ignored gracefully on mobile                         |

## Trade-offs

- Custom global keyboard shortcuts for direct Fill/Record without opening the popup are intentionally **not** added because in Chromium MV3 custom `commands` do not grant `activeTab` permission (they would require broad `<all_urls>` host permissions). Instead, `_execute_action` opens the popup (which grants `activeTab`) where single-key shortcuts (`F` to Fill, `R` to Record) work immediately.
