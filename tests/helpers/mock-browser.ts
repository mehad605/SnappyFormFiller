import type {
  ActiveTabInfo,
  BrowserAdapter,
  BrowserTarget,
  ContextMenuItem,
  FrameExecutionResult,
} from '../../src/core/types';

export interface MockBrowserOptions {
  target?: BrowserTarget;
  activeTab?: ActiveTabInfo | null;
  initialStorage?: Record<string, unknown>;
  grantedOrigins?: string[];
  version?: string;
  onExecuteFileAndCall?: <TPayload, TResult>(
    tabId: number,
    scriptFile: string,
    runnerKey: string,
    payload: TPayload,
    allFrames?: boolean
  ) => Promise<TResult> | TResult;
}

export interface MockBrowserControls {
  adapter: BrowserAdapter;
  storage: Map<string, unknown>;
  grantedOrigins: Set<string>;
  openedOptionsHashes: Array<string | undefined>;
  registeredMenus: ContextMenuItem[];
  flashedBadges: Array<{ tabId: number; text: string; color: string }>;
  setActiveTab(tab: ActiveTabInfo | null): void;
  triggerInstalled(reason?: string): Promise<void>;
  triggerCommand(command: string): Promise<void>;
  triggerContextMenu(menuItemId: string, tab?: ActiveTabInfo | null): Promise<void>;
  sendToBackground(message: unknown): Promise<unknown>;
}

export function createMockBrowser(options: MockBrowserOptions = {}): MockBrowserControls {
  const target: BrowserTarget = options.target ?? 'chromium';
  let activeTab: ActiveTabInfo | null =
    options.activeTab !== undefined
      ? options.activeTab
      : { id: 1, url: 'https://example.com/signup' };
  const storage = new Map<string, unknown>(Object.entries(options.initialStorage ?? {}));
  const grantedOrigins = new Set<string>(options.grantedOrigins ?? []);
  const openedOptionsHashes: Array<string | undefined> = [];
  const registeredMenus: ContextMenuItem[] = [];
  const flashedBadges: Array<{ tabId: number; text: string; color: string }> = [];
  const messageListeners: Array<(message: unknown) => Promise<unknown> | unknown> = [];
  const installedListeners: Array<(reason: string) => Promise<void> | void> = [];
  const commandListeners: Array<(command: string) => Promise<void> | void> = [];
  const menuListeners: Array<
    (menuItemId: string, tab: ActiveTabInfo | null) => Promise<void> | void
  > = [];

  const executeFileAndCallFrames = async <TPayload, TResult>(
    tabId: number,
    scriptFile: string,
    runnerKey: string,
    payload: TPayload,
    allFrames: boolean
  ): Promise<Array<FrameExecutionResult<TResult>>> => {
    if (!options.onExecuteFileAndCall) {
      throw new Error(`Unexpected executeFileAndCall(${scriptFile})`);
    }
    const result = await options.onExecuteFileAndCall<TPayload, TResult>(
      tabId,
      scriptFile,
      runnerKey,
      payload,
      allFrames
    );
    return [{ frameId: 0, result }];
  };

  const adapter: BrowserAdapter = {
    target,
    supportsPopupFilePicker() {
      return target !== 'firefox';
    },
    async getActiveTab() {
      return activeTab;
    },
    executeFileAndCallFrames,
    async hasOriginPermission(originPattern: string): Promise<boolean> {
      return grantedOrigins.has(originPattern) || grantedOrigins.has('<all_urls>');
    },
    async requestOriginPermission(originPattern: string): Promise<boolean> {
      grantedOrigins.add(originPattern);
      return true;
    },
    async removeOriginPermission(originPattern: string): Promise<boolean> {
      return grantedOrigins.delete(originPattern);
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
    onCommand(handler) {
      commandListeners.push(handler);
    },
    async registerContextMenus(items) {
      registeredMenus.length = 0;
      registeredMenus.push(...items);
    },
    onContextMenuClick(handler) {
      menuListeners.push(handler);
    },
    async flashBadge(tabId, text, color) {
      flashedBadges.push({ tabId, text, color });
    },
  };

  return {
    adapter,
    storage,
    grantedOrigins,
    openedOptionsHashes,
    registeredMenus,
    flashedBadges,
    setActiveTab(tab) {
      activeTab = tab;
    },
    async triggerInstalled(reason = 'update') {
      for (const listener of installedListeners) {
        await listener(reason);
      }
    },
    async triggerCommand(command: string) {
      for (const listener of commandListeners) {
        await listener(command);
      }
    },
    async triggerContextMenu(menuItemId: string, tab: ActiveTabInfo | null = activeTab) {
      for (const listener of menuListeners) {
        await listener(menuItemId, tab);
      }
    },
    async sendToBackground(message: unknown) {
      const first = messageListeners[0];
      if (!first) throw new Error('No message listener registered');
      return await first(message);
    },
  };
}
