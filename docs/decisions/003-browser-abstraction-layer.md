# ADR 003: Browser Abstraction Layer

- **Status:** Accepted
- **Date:** 2026-11-26

## Context

In v2.0, `popup.js` calls `chrome.tabs.query`, `chrome.scripting.executeScript`, and `chrome.storage.local.*` directly using nested callbacks, with no `chrome.runtime.lastError` handling and no Firefox `browser.*` support. The rewrite requires that **no feature or UI code calls `chrome.*` or `browser.*` directly**.

## Options Considered

| Option                                              | Bundle Size (minified) |   Dependencies | Testability                                                                     | Notes                                                                                                                                                                                        |
| --------------------------------------------------- | ---------------------: | -------------: | ------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **`webextension-polyfill`**                         |                ~9.1 KB |  1 runtime dep | Medium (mocks global `chrome`)                                                  | Wraps 50+ WebExtension namespaces we never use; adds runtime proxy overhead on every call.                                                                                                   |
| **Thin custom adapter (`src/platform/browser.ts`)** |                ~1.5 KB | 0 runtime deps | High (pure TypeScript interface `BrowserAdapter` injectable into every feature) | Covers the exact 4 namespaces we use (`tabs`, `scripting`, `storage`, `runtime`), normalizes Promise/callback and `lastError` differences, detects runtime target (`chromium` vs `firefox`). |
| **Direct `chrome.*` with Promises**                 |                   0 KB |              0 | Low                                                                             | Breaks strict platform boundary requirement; leaks browser globals into features; misses Firefox `browser.*` nuances.                                                                        |

## Decision

Build a thin, zero-dependency, strictly typed platform adapter in `src/platform/browser.ts` implementing a `BrowserAdapter` interface.

### Key Design Guarantees

1. **Zero direct global calls outside `src/platform/`:** Enforced automatically by ESLint `no-restricted-globals` banning `chrome` and `browser` everywhere under `src/core/`, `src/features/`, and `src/ui/`.
2. **Unified Promise API:** Handles both Promise-returning (`browser.*` and modern `chrome.*`) and callback-based implementations cleanly, always rejecting on `runtime.lastError`.
3. **Explicit browser capability helpers:** Exposes `supportsPopupFilePicker()` (returns `false` on Firefox so the popup routes Import to the full-page Profile Manager seamlessly).
4. **First-class test doubles:** Unit and integration tests pass an in-memory `createMockBrowserAdapter()` without touching `globalThis.chrome`.

## Trade-offs

- If a future feature needs a new WebExtension API (e.g., `alarms`), a contributor must add one typed method to `BrowserAdapter` in `src/platform/browser.ts`. That friction is desirable: it acts as a review checkpoint against permission creep and cross-browser regressions.
