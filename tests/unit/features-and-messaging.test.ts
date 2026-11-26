import { describe, expect, it, vi } from 'vitest';
import { FeatureRegistry } from '../../src/core/feature-registry';
import { MessageRouter } from '../../src/core/messaging';
import { StorageRepository } from '../../src/core/storage';
import type { PopupActionContext, RecordedField } from '../../src/core/types';
import { createFeatureRegistry } from '../../src/features';
import { createExampleStatsFeature } from '../../src/features/_example-template';
import {
  renderFieldEditorList,
  showImportChoice,
  showInlineConfirm,
} from '../../src/ui/shared/components';
import { createMockBrowser } from '../helpers/mock-browser';

describe('FeatureRegistry, feature modules, and MessageRouter', () => {
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
      .find((a) => a.id === 'example-show-stats');
    expect(statsAction).toBeDefined();

    const notify = vi.fn();
    const ctx: PopupActionContext = {
      browser: mock.adapter,
      activeTab: { id: 1, url: 'https://example.com' },
      origin: 'https://example.com',
      activeProfileId: 'default',
      notify,
      requestConfirm: async () => true,
      refresh: async () => {},
    };

    await statsAction!.execute(ctx);
    expect(notify).toHaveBeenCalledWith('1 site(s), 1 profile(s), 1 field(s)', 'info');
  });

  it('routes Firefox popup Import to the full-page Options tab', async () => {
    const mock = createMockBrowser({ target: 'firefox' });
    const storage = new StorageRepository(mock.adapter);
    const popupPickerSpy = vi.fn();

    const registry = createFeatureRegistry({
      storage,
      onRequestPopupImport: popupPickerSpy,
    });
    const importAction = registry.getPopupActions('utility').find((a) => a.id === 'import')!;

    await importAction.execute({
      browser: mock.adapter,
      activeTab: { id: 1, url: 'https://example.com' },
      origin: 'https://example.com',
      activeProfileId: null,
      notify: vi.fn(),
      requestConfirm: async () => true,
      refresh: async () => {},
    });

    expect(popupPickerSpy).not.toHaveBeenCalled();
    expect(mock.openedOptionsHashes).toEqual(['#import']);
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

    // No <img> element should ever be created from untrusted label text
    expect(host.querySelector('img')).toBeNull();
    expect(host.querySelector('.field-label')?.textContent).toBe('<img src=x onerror=alert(1)>');

    // Toggle checkbox
    const checkbox = host.querySelector<HTMLInputElement>('input.field-toggle')!;
    checkbox.checked = true;
    checkbox.dispatchEvent(new Event('change'));
    expect(onChange).toHaveBeenCalledWith(1, expect.objectContaining({ checked: true }));

    // Password starts masked and toggles to text
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
