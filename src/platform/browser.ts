import type { ActiveTabInfo, BrowserAdapter, BrowserTarget } from '../core/types';

declare const __BUILD_TARGET__: BrowserTarget | undefined;

interface RawTab {
  id?: number;
  url?: string;
}

interface RawInjectionResult<T = unknown> {
  result?: T;
}

interface RawWebExtensionApi {
  tabs?: {
    query(queryInfo: { active: boolean; currentWindow: boolean }): Promise<RawTab[]>;
    create(createProperties: { url: string }): Promise<unknown>;
  };
  scripting?: {
    executeScript<TArgs extends unknown[], TResult>(injection: {
      target: { tabId: number };
      files?: string[];
      func?: (...args: TArgs) => TResult;
      args?: TArgs;
    }): Promise<Array<RawInjectionResult<TResult>>>;
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
 * This is the ONLY module in the codebase permitted to touch `browser.*` or `chrome.*`.
 */
export function createBrowserAdapter(): BrowserAdapter {
  const target = detectTarget();

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

    async executeFileAndCall<TPayload, TResult>(
      tabId: number,
      scriptFile: string,
      runnerKey: string,
      payload: TPayload
    ): Promise<TResult> {
      const api = getRawApi();
      if (!api.scripting) {
        throw new Error('Scripting API is unavailable');
      }

      // Step 1: Inject self-contained bundled script into the isolated world.
      await api.scripting.executeScript({
        target: { tabId },
        files: [scriptFile],
      });

      // Step 2: Invoke the isolated-world runner with structured-clone args and clean up immediately.
      const results = await api.scripting.executeScript<[string, TPayload], TResult>({
        target: { tabId },
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

      const first = results?.[0];
      if (!first || typeof first.result === 'undefined') {
        throw new Error('Script execution returned no result');
      }
      return first.result;
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
  };
}
