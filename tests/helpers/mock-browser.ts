import type { ActiveTabInfo, BrowserAdapter, BrowserTarget } from '../../src/core/types';

export interface MockBrowserOptions {
  target?: BrowserTarget;
  activeTab?: ActiveTabInfo | null;
  initialStorage?: Record<string, unknown>;
  version?: string;
  onExecuteFileAndCall?: <TPayload, TResult>(
    tabId: number,
    scriptFile: string,
    runnerKey: string,
    payload: TPayload
  ) => Promise<TResult> | TResult;
}

export interface MockBrowserControls {
  adapter: BrowserAdapter;
  storage: Map<string, unknown>;
  openedOptionsHashes: Array<string | undefined>;
  setActiveTab(tab: ActiveTabInfo | null): void;
  triggerInstalled(reason?: string): Promise<void>;
  sendToBackground(message: unknown): Promise<unknown>;
}

export function createMockBrowser(options: MockBrowserOptions = {}): MockBrowserControls {
  const target: BrowserTarget = options.target ?? 'chromium';
  let activeTab: ActiveTabInfo | null =
    options.activeTab !== undefined
      ? options.activeTab
      : { id: 1, url: 'https://example.com/signup' };
  const storage = new Map<string, unknown>(Object.entries(options.initialStorage ?? {}));
  const openedOptionsHashes: Array<string | undefined> = [];
  const messageListeners: Array<(message: unknown) => Promise<unknown> | unknown> = [];
  const installedListeners: Array<(reason: string) => Promise<void> | void> = [];

  const adapter: BrowserAdapter = {
    target,
    supportsPopupFilePicker() {
      return target !== 'firefox';
    },
    async getActiveTab() {
      return activeTab;
    },
    async executeFileAndCall<TPayload, TResult>(
      tabId: number,
      scriptFile: string,
      runnerKey: string,
      payload: TPayload
    ): Promise<TResult> {
      if (!options.onExecuteFileAndCall) {
        throw new Error(`Unexpected executeFileAndCall(${scriptFile})`);
      }
      return await options.onExecuteFileAndCall(tabId, scriptFile, runnerKey, payload);
    },
    async storageGet<T = unknown>(keys: string[]): Promise<Record<string, T>> {
      const out: Record<string, T> = {};
      for (const k of keys) {
        if (storage.has(k)) {
          out[k] = structuredClone(storage.get(k)) as T;
        }
      }
      return out;
    },
    async storageSet(items: Record<string, unknown>): Promise<void> {
      for (const [k, v] of Object.entries(items)) {
        storage.set(k, structuredClone(v));
      }
    },
    async storageRemove(keys: string[]): Promise<void> {
      for (const k of keys) {
        storage.delete(k);
      }
    },
    async openOptionsPage(hash?: string): Promise<void> {
      openedOptionsHashes.push(hash);
    },
    getVersion(): string {
      return options.version ?? '3.0.0';
    },
    async sendMessage<TReq, TRes>(message: TReq): Promise<TRes | undefined> {
      const first = messageListeners[0];
      if (!first) return undefined;
      return (await first(message)) as TRes;
    },
    onMessage(handler) {
      messageListeners.push(handler);
    },
    onInstalled(handler) {
      installedListeners.push(handler);
    },
  };

  return {
    adapter,
    storage,
    openedOptionsHashes,
    setActiveTab(tab) {
      activeTab = tab;
    },
    async triggerInstalled(reason = 'update') {
      for (const listener of installedListeners) {
        await listener(reason);
      }
    },
    async sendToBackground(message: unknown) {
      const first = messageListeners[0];
      if (!first) throw new Error('No message listener registered');
      return await first(message);
    },
  };
}
