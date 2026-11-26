# ADR 004: State, Storage, and Messaging Architecture

- **Status:** Accepted
- **Date:** 2026-11-26

## Context

In v2.0, storage was stored as an unversioned dictionary `{ profiles: { [origin]: Field[] } }` mutated directly inside `popup.js` click handlers, with no schema version, no validation, no migration path, and only one unnamed profile per origin. Meanwhile, page interaction used `chrome.scripting.executeScript` return values directly with no persistent content scripts.

## Options Considered

### Storage Backend

| Option              | Capacity                                   | Privacy                                                                       | Cross-Browser                                               | Verdict             |
| ------------------- | ------------------------------------------ | ----------------------------------------------------------------------------- | ----------------------------------------------------------- | ------------------- |
| **`storage.local`** | 10 MB (unlimited if needed, not requested) | 100% on-device, never uploaded to browser cloud sync                          | Identical on Chromium & Firefox                             | **Chosen**          |
| **`storage.sync`**  | 100 KB total, 8 KB per item                | Synced to Google/Mozilla account (undesirable for internal staging form data) | Quota errors on large profiles                              | Rejected            |
| **IndexedDB**       | Large                                      | On-device                                                                     | Higher boilerplate; awkward for simple atomic profile reads | Rejected (overkill) |

### Page Communication

| Option                                                 |                     Idle Memory | Permissions                           | Complexity | Verdict                                    |
| ------------------------------------------------------ | ------------------------------: | ------------------------------------- | ---------- | ------------------------------------------ |
| **On-demand `scripting.executeScript` + return value** |            0 B on inactive tabs | `activeTab` + `scripting` only        | Low        | **Chosen**                                 |
| **Always-on `content_scripts` + `tabs.sendMessage`**   | Allocates JS realm on every tab | Requires `<all_urls>` host permission | Medium     | Rejected (privacy & efficiency regression) |

## Decision

1. **Versioned Storage Schema (v3) in `storage.local`:**

   ```ts
   interface StorageRootV3 {
     schemaVersion: 3;
     settings: ExtensionSettings;
     sites: Record<string, SiteProfileCollection>;
   }
   ```
   - Supports **multiple named profiles per origin** (`SiteProfileCollection` with `activeProfileId` and `profiles: FormProfile[]`).
   - Every profile tracks `id`, `name`, `updatedAt`, and typed `RecordedField[]`.
   - Automatic, idempotent migration from v2.0 (`{ profiles: { [origin]: LegacyField[] } }`) runs both in `runtime.onInstalled` and defensively on first read in `StorageRepository`, guaranteeing zero data loss for existing v2.0 users.

2. **Repository Pattern (`src/core/storage.ts`):**
   - All reads/writes go through `StorageRepository`, which validates origins, sanitizes field objects, prevents prototype pollution (`Object.create(null)` / key allowlisting), and serializes concurrent writes via a lightweight promise queue so rapid inline edits cannot race and overwrite each other.

3. **Event-Driven Background Worker + Typed Messaging (`src/core/messaging.ts`):**
   - Page recording and filling continue to use **on-demand `scripting.executeScript`** (zero persistent content scripts, zero background CPU/RAM).
   - A minimal event-driven background script (`src/background/index.ts`) runs v2 -> v3 migration on `onInstalled` and exposes typed message handlers for cross-view coordination (e.g., notifying open views on settings updates) without any timers, alarms, or polling.

## Trade-offs

- On-demand script injection means we cannot automatically fill forms on page load without user action. This is an **intentional security and efficiency decision**: automatic fill on load would require `<all_urls>` host permissions and expose form data to unintended pages.
