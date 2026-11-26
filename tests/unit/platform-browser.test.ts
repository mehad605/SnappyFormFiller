import { afterEach, describe, expect, it, vi } from 'vitest';
import { createBrowserAdapter } from '../../src/platform/browser';

const originalGlobal = globalThis as Record<string, unknown>;

afterEach(() => {
  delete originalGlobal['chrome'];
  delete originalGlobal['browser'];
  delete originalGlobal['__testRunner'];
  vi.restoreAllMocks();
});

function createFakeWebExtApi() {
  const store = new Map<string, unknown>();
  const messageListeners: Array<
    (msg: unknown, sender: unknown, sendResponse: (res?: unknown) => void) => boolean | void
  > = [];
  const installListeners: Array<(details: { reason: string }) => void> = [];
  const createdTabs: Array<{ url: string }> = [];
  let openOptionsCalls = 0;

  const api = {
    tabs: {
      query: vi.fn(async () => [{ id: 42, url: 'https://forms.example/contact' }]),
      create: vi.fn(async (opts: { url: string }) => {
        createdTabs.push(opts);
        return opts;
      }),
    },
    scripting: {
      executeScript: vi.fn(
        async (injection: {
          target: { tabId: number };
          files?: string[];
          func?: (...args: unknown[]) => unknown;
          args?: unknown[];
        }) => {
          if (injection.files) {
            originalGlobal['__testRunner'] = (payload: { x: number }) => ({
              doubled: payload.x * 2,
            });
            return [{ result: undefined }];
          }
          if (injection.func) {
            const result = injection.func(...(injection.args ?? []));
            return [{ result }];
          }
          return [];
        }
      ),
    },
    storage: {
      local: {
        get: vi.fn(async (keys: string[]) => {
          const out: Record<string, unknown> = {};
          for (const k of keys) {
            if (store.has(k)) out[k] = store.get(k);
          }
          return out;
        }),
        set: vi.fn(async (items: Record<string, unknown>) => {
          for (const [k, v] of Object.entries(items)) store.set(k, v);
        }),
        remove: vi.fn(async (keys: string[]) => {
          for (const k of keys) store.delete(k);
        }),
      },
    },
    runtime: {
      getManifest: () => ({ version: '3.0.0' }),
      getURL: (path: string) => `moz-extension://test-id/${path}`,
      openOptionsPage: vi.fn(async () => {
        openOptionsCalls += 1;
      }),
      sendMessage: vi.fn(async (msg: unknown) => ({ echo: msg })),
      onMessage: {
        addListener(
          fn: (
            msg: unknown,
            sender: unknown,
            sendResponse: (res?: unknown) => void
          ) => boolean | void
        ) {
          messageListeners.push(fn);
        },
      },
      onInstalled: {
        addListener(fn: (details: { reason: string }) => void) {
          installListeners.push(fn);
        },
      },
    },
  };

  return {
    api,
    createdTabs,
    messageListeners,
    installListeners,
    getOpenOptionsCalls: () => openOptionsCalls,
  };
}

describe('platform BrowserAdapter (Chromium & Firefox)', () => {
  it('wraps Chromium chrome.* APIs cleanly and cleans up isolated runner key', async () => {
    const fake = createFakeWebExtApi();
    originalGlobal['chrome'] = fake.api;

    const adapter = createBrowserAdapter();
    expect(adapter.getVersion()).toBe('3.0.0');

    const tab = await adapter.getActiveTab();
    expect(tab).toEqual({ id: 42, url: 'https://forms.example/contact' });

    const res = await adapter.executeFileAndCall<{ x: number }, { doubled: number }>(
      42,
      'scripts/record.js',
      '__testRunner',
      { x: 21 }
    );
    expect(res).toEqual({ doubled: 42 });
    // Verify atomic cleanup deleted the temporary isolated-world runner
    expect('__testRunner' in originalGlobal).toBe(false);

    await adapter.storageSet({ k: 'v' });
    expect(await adapter.storageGet(['k'])).toEqual({ k: 'v' });
    await adapter.storageRemove(['k']);
    expect(await adapter.storageGet(['k'])).toEqual({});

    await adapter.openOptionsPage();
    expect(fake.getOpenOptionsCalls()).toBe(1);
    await adapter.openOptionsPage('#import');
    expect(fake.createdTabs).toEqual([{ url: 'moz-extension://test-id/options.html#import' }]);
  });

  it('prefers browser.* on Firefox and handles async onMessage responses and errors', async () => {
    const fake = createFakeWebExtApi();
    originalGlobal['browser'] = fake.api;
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue('Mozilla/5.0 Firefox/136.0');

    const adapter = createBrowserAdapter();
    expect(adapter.target).toBe('firefox');
    expect(adapter.supportsPopupFilePicker()).toBe(false);

    adapter.onMessage(async (msg) => {
      if (msg === 'boom') throw new Error('test failure');
      return { ok: true, msg };
    });

    const sendOk = vi.fn();
    const keepOpen = fake.messageListeners[0]!('ping', {}, sendOk);
    expect(keepOpen).toBe(true);
    await vi.waitFor(() => expect(sendOk).toHaveBeenCalledWith({ ok: true, msg: 'ping' }));

    const sendErr = vi.fn();
    fake.messageListeners[0]!('boom', {}, sendErr);
    await vi.waitFor(() =>
      expect(sendErr).toHaveBeenCalledWith({ ok: false, error: 'test failure' })
    );

    const installedSpy = vi.fn();
    adapter.onInstalled(installedSpy);
    fake.installListeners[0]!({ reason: 'install' });
    expect(installedSpy).toHaveBeenCalledWith('install');
  });

  it('returns null when no active tab is found', async () => {
    const fake = createFakeWebExtApi();
    fake.api.tabs.query.mockResolvedValueOnce([]);
    originalGlobal['chrome'] = fake.api;

    const adapter = createBrowserAdapter();
    expect(await adapter.getActiveTab()).toBeNull();
  });
});
