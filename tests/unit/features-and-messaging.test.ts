import { describe, expect, it, vi } from 'vitest';
import { FeatureRegistry } from '../../src/core/feature-registry';
import { MessageRouter } from '../../src/core/messaging';
import { StorageRepository } from '../../src/core/storage';
import type {
  FillResult,
  PopupActionContext,
  RecordedField,
  RecordResult,
} from '../../src/core/types';
import { createFeatureRegistry } from '../../src/features';
import { createExampleStatsFeature } from '../../src/features/_example-template';
import {
  renderFieldEditorList,
  showImportChoice,
  showInlineConfirm,
} from '../../src/ui/shared/components';
import { createMockBrowser } from '../helpers/mock-browser';

function makeContext(
  mock: ReturnType<typeof createMockBrowser>,
  overrides: Partial<PopupActionContext> = {}
) {
  const notify = vi.fn();
  const refresh = vi.fn(async () => {});
  const requestConfirm = vi.fn(async () => true);

  const ctx: PopupActionContext = {
    browser: mock.adapter,
    activeTab: { id: 1, url: 'https://example.com/form' },
    origin: 'https://example.com',
    activeProfileId: 'default',
    notify,
    requestConfirm,
    refresh,
    ...overrides,
  };
  return { ctx, notify, refresh, requestConfirm };
}

describe('FeatureRegistry, feature actions, and MessageRouter', () => {
  it('allows adding the example template feature without modifying core code', async () => {
    const mock = createMockBrowser();
    const storage = new StorageRepository(mock.adapter);
    await storage.saveProfileFields('https://example.com', [
      { label: 'Name', type: 'text', value: 'Ada', locator: { id: 'name' } },
    ]);

    const registry = createFeatureRegistry({ storage });
    registry.register(createExampleStatsFeature(storage));

    const statsAction = registry
      .getPopupActions('utility')
      .find((a) => a.id === 'example-show-stats')!;
    const { ctx, notify } = makeContext(mock);

    await statsAction.execute(ctx);
    expect(notify).toHaveBeenCalledWith('1 site(s), 1 profile(s), 1 field(s)', 'info');
  });

  it('executes recorder action for populated, sensitive-skipped, and empty forms', async () => {
    let nextRecordResult: RecordResult = {
      fields: [{ label: 'Email', type: 'email', value: 'a@b.co', locator: { id: 'email' } }],
      skippedSensitive: 1,
      skippedEmpty: 0,
    };

    const mock = createMockBrowser({
      onExecuteFileAndCall: async <_TPayload, TResult>() => nextRecordResult as unknown as TResult,
    });
    const storage = new StorageRepository(mock.adapter);
    const registry = createFeatureRegistry({ storage });
    const recordAction = registry.getPopupActions('primary').find((a) => a.id === 'record')!;

    const first = makeContext(mock);
    await recordAction.execute(first.ctx);
    expect(first.notify).toHaveBeenCalledWith(
      'Recorded 1 field(s) (1 sensitive skipped)',
      'success'
    );
    expect(first.refresh).toHaveBeenCalledTimes(1);
    expect((await storage.getActiveProfile('https://example.com'))?.fields).toHaveLength(1);

    nextRecordResult = { fields: [], skippedSensitive: 2, skippedEmpty: 0 };
    const second = makeContext(mock);
    await recordAction.execute(second.ctx);
    expect(second.notify).toHaveBeenCalledWith(
      'No recordable form fields found (2 sensitive skipped)',
      'warn'
    );
  });

  it('executes filler action across full fill, partial unmatched, unchanged, and empty profile', async () => {
    let nextFillResult: FillResult = {
      filledCount: 2,
      unchangedCount: 0,
      skippedDisabledCount: 0,
      unmatchedLabels: [],
    };

    const mock = createMockBrowser({
      onExecuteFileAndCall: async <_TPayload, TResult>() => nextFillResult as unknown as TResult,
    });
    const storage = new StorageRepository(mock.adapter);
    const registry = createFeatureRegistry({ storage });
    const fillAction = registry.getPopupActions('primary').find((a) => a.id === 'fill')!;

    // Empty profile
    const empty = makeContext(mock);
    await fillAction.execute(empty.ctx);
    expect(empty.notify).toHaveBeenCalledWith('No fields saved for this profile', 'warn');

    await storage.saveProfileFields('https://example.com', [
      { label: 'Name', type: 'text', value: 'Ada', locator: { id: 'name' } },
      { label: 'City', type: 'text', value: 'London', locator: { id: 'city' } },
    ]);

    // Full fill
    const full = makeContext(mock);
    await fillAction.execute(full.ctx);
    expect(full.notify).toHaveBeenCalledWith('Filled 2 field(s)!', 'success');

    // Partial unmatched
    nextFillResult = {
      filledCount: 1,
      unchangedCount: 0,
      skippedDisabledCount: 0,
      unmatchedLabels: ['City'],
    };
    const partial = makeContext(mock);
    await fillAction.execute(partial.ctx);
    expect(partial.notify).toHaveBeenCalledWith('Filled 1/2 (1 unmatched)', 'warn');

    // Already up to date
    nextFillResult = {
      filledCount: 0,
      unchangedCount: 2,
      skippedDisabledCount: 0,
      unmatchedLabels: [],
    };
    const same = makeContext(mock);
    await fillAction.execute(same.ctx);
    expect(same.notify).toHaveBeenCalledWith('All 2 field(s) already up to date', 'info');
  });

  it('executes clear-site and clear-all respecting inline confirmation cancellation', async () => {
    const mock = createMockBrowser();
    const storage = new StorageRepository(mock.adapter);
    await storage.saveProfileFields('https://example.com', [
      { label: 'Name', type: 'text', value: 'Ada', locator: { id: 'name' } },
    ]);
    await storage.saveProfileFields('https://other.example', [
      { label: 'Name', type: 'text', value: 'Grace', locator: { id: 'name' } },
    ]);

    const registry = createFeatureRegistry({ storage });
    const clearSite = registry.getPopupActions('secondary').find((a) => a.id === 'clear-site')!;
    const clearAll = registry.getPopupActions('secondary').find((a) => a.id === 'clear-all')!;

    // Cancel clear-site preserves data
    const cancelCtx = makeContext(mock, { requestConfirm: vi.fn(async () => false) });
    await clearSite.execute(cancelCtx.ctx);
    expect(await storage.getSite('https://example.com')).not.toBeNull();

    // Confirm clear-site deletes only active origin
    const okSite = makeContext(mock);
    await clearSite.execute(okSite.ctx);
    expect(await storage.getSite('https://example.com')).toBeNull();
    expect(await storage.getSite('https://other.example')).not.toBeNull();

    // Confirm clear-all deletes remaining sites
    const okAll = makeContext(mock);
    await clearAll.execute(okAll.ctx);
    expect(Object.keys((await storage.load()).sites)).toEqual([]);
  });

  it('handles export and routes import per platform (Chromium picker vs Firefox Options)', async () => {
    const createObjectURL = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock');
    const revokeObjectURL = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    const chromiumMock = createMockBrowser({ target: 'chromium' });
    const chromiumStorage = new StorageRepository(chromiumMock.adapter);
    const popupPickerSpy = vi.fn();
    const chromiumReg = createFeatureRegistry({
      storage: chromiumStorage,
      onRequestPopupImport: popupPickerSpy,
    });

    const exportAction = chromiumReg.getPopupActions('utility').find((a) => a.id === 'export')!;
    const importAction = chromiumReg.getPopupActions('utility').find((a) => a.id === 'import')!;

    // Export empty warns
    const emptyExport = makeContext(chromiumMock);
    await exportAction.execute(emptyExport.ctx);
    expect(emptyExport.notify).toHaveBeenCalledWith('Nothing to export yet', 'warn');

    // Export populated triggers download
    await chromiumStorage.saveProfileFields('https://example.com', [
      { label: 'A', type: 'text', value: '1', locator: { id: 'a' } },
    ]);
    const okExport = makeContext(chromiumMock);
    await exportAction.execute(okExport.ctx);
    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect(okExport.notify).toHaveBeenCalledWith('Exported 1 site(s)', 'success');

    // Chromium import clicks popup picker
    await importAction.execute(makeContext(chromiumMock).ctx);
    expect(popupPickerSpy).toHaveBeenCalledTimes(1);

    // Firefox import opens Options #import
    const firefoxMock = createMockBrowser({ target: 'firefox' });
    const firefoxStorage = new StorageRepository(firefoxMock.adapter);
    const firefoxPickerSpy = vi.fn();
    const firefoxReg = createFeatureRegistry({
      storage: firefoxStorage,
      onRequestPopupImport: firefoxPickerSpy,
    });
    const ffImport = firefoxReg.getPopupActions('utility').find((a) => a.id === 'import')!;
    await ffImport.execute(makeContext(firefoxMock).ctx);
    expect(firefoxPickerSpy).not.toHaveBeenCalled();
    expect(firefoxMock.openedOptionsHashes).toEqual(['#import']);

    createObjectURL.mockRestore();
    revokeObjectURL.mockRestore();
    clickSpy.mockRestore();
  });

  it('dispatches background message handlers registered by features', async () => {
    const mock = createMockBrowser();
    const storage = new StorageRepository(mock.adapter);
    await storage.saveProfileFields('https://a.example', [
      { label: 'A', type: 'text', value: '1', locator: { id: 'a' } },
    ]);

    const registry = createFeatureRegistry({ storage });
    const router = new MessageRouter();
    for (const [type, handler] of Object.entries(registry.getBackgroundHandlers())) {
      router.register(type, handler);
    }

    const res = await router.dispatch({ type: 'profiles:summary' });
    expect(res).toEqual({
      ok: true,
      data: { siteCount: 1, profileCount: 1, fieldCount: 1 },
    });

    const bad = await router.dispatch({ type: 'unknown:msg' });
    expect(bad.ok).toBe(false);
  });

  it('rejects duplicate feature registration', () => {
    const registry = new FeatureRegistry();
    const feature = { id: 'dup', name: 'Dup', description: 'test' };
    registry.register(feature);
    expect(() => registry.register(feature)).toThrow(/already registered/);
  });
});

describe('UI shared components (XSS-safe & accessible)', () => {
  it('supports inline checkbox toggling, text editing, password masking, and safe XSS escaping', () => {
    const host = document.createElement('div');
    const onChange = vi.fn();
    const onDelete = vi.fn();

    const fields: RecordedField[] = [
      { label: '<img src=x onerror=alert(1)>', type: 'text', value: 'hello', locator: { id: 'a' } },
      { label: 'Agree', type: 'checkbox', value: 'yes', checked: false, locator: { id: 'b' } },
      {
        label: 'Password',
        type: 'password',
        value: 'secret',
        sensitive: true,
        locator: { id: 'c' },
      },
    ];

    renderFieldEditorList(host, fields, { onChange, onDelete });

    expect(host.querySelector('img')).toBeNull();
    expect(host.querySelector('.field-label')?.textContent).toBe('<img src=x onerror=alert(1)>');

    const checkbox = host.querySelector<HTMLInputElement>('input.field-toggle')!;
    checkbox.checked = true;
    checkbox.dispatchEvent(new Event('change'));
    expect(onChange).toHaveBeenCalledWith(1, expect.objectContaining({ checked: true }));

    const pwInput = host.querySelector<HTMLInputElement>('input[type="password"]')!;
    expect(pwInput).not.toBeNull();
    const revealBtn = host.querySelector<HTMLButtonElement>('button.icon-btn')!;
    revealBtn.click();
    expect(pwInput.type).toBe('text');
  });

  it('resolves 3-way import choice (Merge / Replace / Cancel) and inline confirm cleanly', async () => {
    const host = document.createElement('div');
    const importPromise = showImportChoice(host, 'Import 2 sites?');
    const buttons = Array.from(host.querySelectorAll('button'));
    expect(buttons.map((b) => b.textContent)).toEqual(['Cancel', 'Merge', 'Replace All']);
    buttons[0]!.click();
    expect(await importPromise).toBe('cancel');

    const confirmPromise = showInlineConfirm(host, {
      message: 'Clear site?',
      confirmLabel: 'Clear',
      variant: 'danger',
    });
    const confirmButtons = Array.from(host.querySelectorAll('button'));
    confirmButtons[1]!.click();
    expect(await confirmPromise).toBe(true);
  });
});
