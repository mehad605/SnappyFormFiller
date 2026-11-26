import { BADGE_DURATION_MS } from '../core/constants';
import type {
  ActiveTabInfo,
  BrowserAdapter,
  BrowserTarget,
  ContextMenuItem,
  FrameExecutionResult,
} from '../core/types';

declare const __BUILD_TARGET__: BrowserTarget | undefined;

interface RawTab {
  id?: number;
  url?: string;
}

interface RawInjectionResult<T = unknown> {
  frameId?: number;
  result?: T;
}

interface RawWebExtensionApi {
  tabs?: {
    query(queryInfo: { active: boolean; currentWindow: boolean }): Promise<RawTab[]>;
    create(createProperties: { url: string }): Promise<unknown>;
  };
  scripting?: {
    executeScript<TArgs extends unknown[], TResult>(injection: {
      target: { tabId: number; allFrames?: boolean };
      files?: string[];
      func?: (...args: TArgs) => TResult;
      args?: TArgs;
    }): Promise<Array<RawInjectionResult<TResult>>>;
  };
  permissions?: {
    contains(permissions: { origins?: string[] }): Promise<boolean>;
    request(permissions: { origins?: string[] }): Promise<boolean>;
    remove(permissions: { origins?: string[] }): Promise<boolean>;
  };
  commands?: {
    onCommand: {
      addListener(listener: (command: string) => void): void;
    };
  };
  contextMenus?: {
    removeAll(): Promise<void> | void;
    create(props: { id: string; title: string; parentId?: string; contexts: string[] }): void;
    onClicked: {
      addListener(listener: (info: { menuItemId: string | number }, tab?: RawTab) => void): void;
    };
  };
  action?: {
    setBadgeText(details: { tabId?: number; text: string }): Promise<void> | void;
    setBadgeBackgroundColor(details: { tabId?: number; color: string }): Promise<void> | void;
  };
  storage?: {
    local: {
      get(keys: string[]): Promise<Record<string, unknown>>;
      set(items: Record<string, unknown>): Promise<void>;
      remove(keys: string[]): Promise<void>;
    };
  };
  runtime?: {
    lastError?: { message?: string };
    getManifest(): { version?: string };
    getURL(path: string): string;
    openOptionsPage(): Promise<void>;
    sendMessage(message: unknown): Promise<unknown>;
    onMessage: {
      addListener(
        listener: (
          message: unknown,
          sender: unknown,
          sendResponse: (response?: unknown) => void
        ) => boolean | Promise<unknown> | void
      ): void;
    };
    onInstalled: {
      addListener(listener: (details: { reason: string }) => void): void;
    };
  };
}

function getRawApi(): RawWebExtensionApi {
  const g = globalThis as unknown as {
    browser?: RawWebExtensionApi;
    chrome?: RawWebExtensionApi;
  };
  const api = g.browser ?? g.chrome;
  if (!api) {
    throw new Error('WebExtension API is not available in this environment');
  }
  return api;
}

function detectTarget(): BrowserTarget {
  if (typeof __BUILD_TARGET__ === 'string') {
    return __BUILD_TARGET__;
  }
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
  return ua.includes('Firefox') ? 'firefox' : 'chromium';
}

/**
 * Thin, zero-dependency WebExtension platform adapter.
 * This is the ONLY module in the codebase permitted to touch `browser.*` or `chrome.*` APIs.
 */
export function createBrowserAdapter(): BrowserAdapter {
  const target = detectTarget();

  const executeFileAndCallFrames = async <TPayload, TResult>(
    tabId: number,
    scriptFile: string,
    runnerKey: string,
    payload: TPayload,
    allFrames: boolean
  ): Promise<Array<FrameExecutionResult<TResult>>> => {
    const api = getRawApi();
    if (!api.scripting) {
      throw new Error('Scripting API is unavailable');
    }

    const injectionTarget = allFrames ? { tabId, allFrames: true } : { tabId };

    // Step 1: Inject self-contained bundled script into the isolated world(s).
    await api.scripting.executeScript({
      target: injectionTarget,
      files: [scriptFile],
    });

    // Step 2: Invoke the isolated-world runner with structured-clone args and clean up immediately.
    const results = await api.scripting.executeScript<[string, TPayload], TResult>({
      target: injectionTarget,
      func: (key: string, arg: TPayload): TResult => {
        const scope = globalThis as Record<string, unknown>;
        const runner = scope[key];
        delete scope[key];
        if (typeof runner !== 'function') {
          throw new Error(`Injected script runner "${key}" failed to initialize`);
        }
        return (runner as (input: TPayload) => TResult)(arg);
      },
      args: [runnerKey, payload],
    });

    const frames: Array<FrameExecutionResult<TResult>> = [];
    for (const entry of results ?? []) {
      if (entry && typeof entry.result !== 'undefined') {
        frames.push({
          frameId: typeof entry.frameId === 'number' ? entry.frameId : 0,
          result: entry.result,
        });
      }
    }

    if (frames.length === 0) {
      throw new Error('Script execution returned no result');
    }

    return frames.sort((a, b) => a.frameId - b.frameId);
  };

  return {
    target,

    supportsPopupFilePicker(): boolean {
      // Firefox immediately closes extension popups when a native file picker opens.
      return target !== 'firefox';
    },

    async getActiveTab(): Promise<ActiveTabInfo | null> {
      const api = getRawApi();
      const tabs = await api.tabs?.query({ active: true, currentWindow: true });
      const tab = tabs?.[0];
      if (!tab || typeof tab.id !== 'number') {
        return null;
      }
      return {
        id: tab.id,
        url: typeof tab.url === 'string' ? tab.url : null,
      };
    },

    executeFileAndCallFrames,

    async hasOriginPermission(originPattern: string): Promise<boolean> {
      const api = getRawApi();
      if (!api.permissions) return false;
      try {
        return Boolean(await api.permissions.contains({ origins: [originPattern] }));
      } catch {
        return false;
      }
    },

    async requestOriginPermission(originPattern: string): Promise<boolean> {
      const api = getRawApi();
      if (!api.permissions) return false;
      try {
        return Boolean(await api.permissions.request({ origins: [originPattern] }));
      } catch {
        return false;
      }
    },

    async removeOriginPermission(originPattern: string): Promise<boolean> {
      const api = getRawApi();
      if (!api.permissions) return false;
      try {
        return Boolean(await api.permissions.remove({ origins: [originPattern] }));
      } catch {
        return false;
      }
    },

    async storageGet<T = unknown>(keys: string[]): Promise<Record<string, T>> {
      const api = getRawApi();
      const result = await api.storage?.local.get(keys);
      return (result ?? {}) as Record<string, T>;
    },

    async storageSet(items: Record<string, unknown>): Promise<void> {
      const api = getRawApi();
      await api.storage?.local.set(items);
    },

    async storageRemove(keys: string[]): Promise<void> {
      const api = getRawApi();
      await api.storage?.local.remove(keys);
    },

    async openOptionsPage(hash?: string): Promise<void> {
      const api = getRawApi();
      if (hash && api.tabs && api.runtime) {
        const cleanHash = hash.startsWith('#') ? hash : `#${hash}`;
        const url = `${api.runtime.getURL('options.html')}${cleanHash}`;
        await api.tabs.create({ url });
        return;
      }
      await api.runtime?.openOptionsPage();
    },

    getVersion(): string {
      const api = getRawApi();
      return api.runtime?.getManifest().version ?? '3.0.0';
    },

    async sendMessage<TReq, TRes>(message: TReq): Promise<TRes | undefined> {
      const api = getRawApi();
      if (!api.runtime) return undefined;
      return (await api.runtime.sendMessage(message)) as TRes | undefined;
    },

    onMessage(handler: (message: unknown) => Promise<unknown> | unknown): void {
      const api = getRawApi();
      api.runtime?.onMessage.addListener((message, _sender, sendResponse) => {
        Promise.resolve(handler(message))
          .then((result) => sendResponse(result))
          .catch((err: unknown) =>
            sendResponse({
              ok: false,
              error: err instanceof Error ? err.message : 'Message handler error',
            })
          );
        // Keep the message channel open for async responses across Chromium and Firefox.
        return true;
      });
    },

    onInstalled(handler: (reason: string) => Promise<void> | void): void {
      const api = getRawApi();
      api.runtime?.onInstalled.addListener((details) => {
        void Promise.resolve(handler(details.reason));
      });
    },

    onCommand(handler: (command: string) => Promise<void> | void): void {
      const api = getRawApi();
      api.commands?.onCommand.addListener((command) => {
        void Promise.resolve(handler(command));
      });
    },

    async registerContextMenus(items: readonly ContextMenuItem[]): Promise<void> {
      const api = getRawApi();
      // Firefox for Android does not expose contextMenus; degrade gracefully.
      if (!api.contextMenus) return;
      try {
        await Promise.resolve(api.contextMenus.removeAll());
        for (const item of items) {
          api.contextMenus.create({
            id: item.id,
            title: item.title,
            ...(item.parentId ? { parentId: item.parentId } : {}),
            contexts: [...item.contexts],
          });
        }
      } catch {
        // Ignore duplicate creation races during rapid reloads.
      }
    },

    onContextMenuClick(
      handler: (menuItemId: string, tab: ActiveTabInfo | null) => Promise<void> | void
    ): void {
      const api = getRawApi();
      if (!api.contextMenus) return;
      api.contextMenus.onClicked.addListener((info, tab) => {
        const activeTab: ActiveTabInfo | null =
          tab && typeof tab.id === 'number'
            ? { id: tab.id, url: typeof tab.url === 'string' ? tab.url : null }
            : null;
        void Promise.resolve(handler(String(info.menuItemId), activeTab));
      });
    },

    async flashBadge(tabId: number, text: string, color: string): Promise<void> {
      const api = getRawApi();
      if (!api.action) return;
      try {
        await Promise.resolve(api.action.setBadgeBackgroundColor({ tabId, color }));
        await Promise.resolve(api.action.setBadgeText({ tabId, text }));
        globalThis.setTimeout(() => {
          void Promise.resolve(api.action?.setBadgeText({ tabId, text: '' })).catch(() => {});
        }, BADGE_DURATION_MS);
      } catch {
        // Tab may have closed before badge cleared.
      }
    },
  };
}
