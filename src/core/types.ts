export type BrowserTarget = 'chromium' | 'firefox';

export interface FieldLocator {
  id?: string;
  name?: string;
  testId?: string;
  ariaLabel?: string;
  labelText?: string;
  placeholder?: string;
  cssPath?: string;
  /** Zero-based occurrence index when multiple inputs share the same name/label. */
  index?: number;
  /** True when the field lives inside an open or closed Shadow DOM root. */
  inShadowDom?: boolean;
  /** Set when the field was recorded inside an iframe (same-origin or opt-in cross-origin). */
  frameOrigin?: string;
  /** Subframe pathname used to disambiguate multiple iframes from the same origin. */
  framePath?: string;
}

export interface RecordedField {
  /** Human-readable display label derived from id, labelText, name, ariaLabel, or placeholder. */
  label: string;
  /** Normalized HTML control type (text, email, checkbox, radio, select-one, select-multiple, textarea, etc.). */
  type: string;
  /** String value for single-value inputs, or string[] for <select multiple>. */
  value: string | string[];
  /** Present for checkbox and radio controls. */
  checked?: boolean;
  /** Marks password fields so UI masks the value by default. */
  sensitive?: boolean;
  /** Multi-strategy match signals captured at record time. */
  locator: FieldLocator;
}

export interface FormProfile {
  id: string;
  name: string;
  updatedAt: number;
  fields: RecordedField[];
}

export interface SiteProfileCollection {
  activeProfileId: string;
  profiles: FormProfile[];
}

export interface ExtensionSettings {
  skipPasswords: boolean;
  skipSensitiveFields: boolean;
  highlightFilled: boolean;
  skipEmptyOnRecord: boolean;
  includeIframes: boolean;
}

export interface StorageRootV3 {
  schemaVersion: 3;
  settings: ExtensionSettings;
  sites: Record<string, SiteProfileCollection>;
}

/** Legacy v2.0 field shape kept for backwards-compatible migration and JSON import. */
export interface LegacyFieldV2 {
  id?: string | null;
  name?: string | null;
  type?: string;
  value?: string;
  checked?: boolean;
}

export interface ExportBundleV3 {
  format: 'snappy-form-filler';
  schemaVersion: 3;
  exportedAt: string;
  sites: Record<string, SiteProfileCollection>;
}

export interface RecordOptions {
  skipPasswords: boolean;
  skipSensitiveFields: boolean;
  skipEmptyOnRecord: boolean;
}

export interface RecordResult {
  fields: RecordedField[];
  skippedSensitive: number;
  skippedEmpty: number;
}

export interface FillOptions {
  fields: RecordedField[];
  highlightFilled: boolean;
}

export interface FillResult {
  filledCount: number;
  unchangedCount: number;
  skippedDisabledCount: number;
  unmatchedLabels: string[];
  /** Indices of options.fields handled by this frame (used to aggregate multi-frame fills accurately). */
  matchedIndices?: number[];
}

export interface FrameExecutionResult<T> {
  frameId: number;
  result: T;
}

export interface ContextMenuItem {
  id: string;
  title: string;
  parentId?: string;
  contexts: readonly string[];
}

export type ImportMode = 'merge' | 'replace';

export interface ImportSummary {
  siteCount: number;
  profileCount: number;
  fieldCount: number;
  sourceVersion: 2 | 3;
}

export interface ActiveTabInfo {
  id: number;
  url: string | null;
}

export interface BrowserAdapter {
  readonly target: BrowserTarget;
  supportsPopupFilePicker(): boolean;
  getActiveTab(): Promise<ActiveTabInfo | null>;
  executeFileAndCallFrames<TPayload, TResult>(
    tabId: number,
    scriptFile: string,
    runnerKey: string,
    payload: TPayload,
    allFrames: boolean
  ): Promise<Array<FrameExecutionResult<TResult>>>;
  hasOriginPermission(originPattern: string): Promise<boolean>;
  requestOriginPermission(originPattern: string): Promise<boolean>;
  removeOriginPermission(originPattern: string): Promise<boolean>;
  storageGet<T = unknown>(keys: string[]): Promise<Record<string, T>>;
  storageSet(items: Record<string, unknown>): Promise<void>;
  storageRemove(keys: string[]): Promise<void>;
  openOptionsPage(hash?: string): Promise<void>;
  getVersion(): string;
  sendMessage<TReq, TRes>(message: TReq): Promise<TRes | undefined>;
  onMessage(handler: (message: unknown) => Promise<unknown> | unknown): void;
  onInstalled(handler: (reason: string) => Promise<void> | void): void;
  onCommand(handler: (command: string) => Promise<void> | void): void;
  registerContextMenus(items: readonly ContextMenuItem[]): Promise<void>;
  onContextMenuClick(
    handler: (menuItemId: string, tab: ActiveTabInfo | null) => Promise<void> | void
  ): void;
  flashBadge(tabId: number, text: string, color: string): Promise<void>;
}

export type PopupActionSlot = 'primary' | 'secondary' | 'utility';
export type PopupActionVariant = 'primary' | 'accent' | 'neutral' | 'danger';

export interface PopupActionContext {
  readonly browser: BrowserAdapter;
  readonly activeTab: ActiveTabInfo | null;
  readonly origin: string | null;
  readonly activeProfileId: string | null;
  notify(message: string, tone?: 'info' | 'success' | 'warn' | 'error'): void;
  requestConfirm(options: {
    message: string;
    confirmLabel: string;
    variant?: 'danger' | 'primary';
  }): Promise<boolean>;
  refresh(): Promise<void>;
}

export interface PopupActionDescriptor {
  readonly id: string;
  readonly label: string;
  readonly slot: PopupActionSlot;
  readonly variant: PopupActionVariant;
  readonly shortcutKey?: string;
  readonly requiresOrigin?: boolean;
  readonly order: number;
  execute(ctx: PopupActionContext): Promise<void>;
}

export interface FeatureModule {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly popupActions?: readonly PopupActionDescriptor[];
  readonly backgroundHandlers?: Readonly<Record<string, (payload: unknown) => Promise<unknown>>>;
}
