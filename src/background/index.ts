import {
  COMMAND_FILL,
  COMMAND_RECORD,
  MENU_ID_FILL,
  MENU_ID_RECORD,
  MENU_ID_ROOT,
} from '../core/constants';
import { MessageRouter } from '../core/messaging';
import { parseSupportedOrigin } from '../core/origin';
import { StorageRepository } from '../core/storage';
import type { ActiveTabInfo } from '../core/types';
import { createBackgroundFeatureRegistry } from '../features';
import { fillActiveTab } from '../features/filler/service';
import { recordActiveTab } from '../features/recorder/service';
import { createBrowserAdapter } from '../platform/browser';

/**
 * Event-driven MV3 background service worker (Chromium) / event page (Firefox).
 * Zero timers, zero polling, zero persistent state — wakes only on install/update,
 * messages, context-menu clicks, or direct global keyboard commands.
 */
const browser = createBrowserAdapter();
const storage = new StorageRepository(browser);
const registry = createBackgroundFeatureRegistry(storage);
const router = new MessageRouter();

for (const [type, handler] of Object.entries(registry.getBackgroundHandlers())) {
  router.register(type, handler);
}

const CONTEXT_MENU_ITEMS = [
  { id: MENU_ID_ROOT, title: 'Snappy Form Filler', contexts: ['page', 'editable', 'frame'] },
  {
    id: MENU_ID_FILL,
    parentId: MENU_ID_ROOT,
    title: 'Fill Form (Active Profile)',
    contexts: ['page', 'editable', 'frame'],
  },
  {
    id: MENU_ID_RECORD,
    parentId: MENU_ID_ROOT,
    title: 'Record Form Fields',
    contexts: ['page', 'editable', 'frame'],
  },
] as const;

async function handleDirectAction(
  kind: 'fill' | 'record',
  tab: ActiveTabInfo | null
): Promise<void> {
  const targetTab = tab ?? (await browser.getActiveTab());
  if (!targetTab) return;

  const origin = parseSupportedOrigin(targetTab.url);
  if (!origin) {
    await browser.flashBadge(targetTab.id, '!', '#d97706');
    return;
  }

  try {
    if (kind === 'fill') {
      const outcome = await fillActiveTab(browser, storage, targetTab.id, origin);
      const count = outcome.result?.filledCount ?? 0;
      const badge = outcome.tone === 'warn' ? '!' : String(count);
      const color = outcome.tone === 'warn' ? '#d97706' : '#059669';
      await browser.flashBadge(targetTab.id, badge, color);
    } else {
      const outcome = await recordActiveTab(browser, storage, targetTab.id, origin);
      const count = outcome.result.fields.length;
      const badge = outcome.tone === 'warn' ? '!' : `R${count}`;
      const color = outcome.tone === 'warn' ? '#d97706' : '#047857';
      await browser.flashBadge(targetTab.id, badge, color);
    }
  } catch {
    // Expected if the user pressed a global hotkey on a Chromium site without opting into
    // per-site direct hotkeys yet. Flash an amber badge so they know to enable it in the popup.
    await browser.flashBadge(targetTab.id, '!', '#d97706');
  }
}

browser.onInstalled(async () => {
  await storage.migrateIfNeeded();
  await browser.registerContextMenus(CONTEXT_MENU_ITEMS);
});

browser.onMessage((message) => router.dispatch(message));

browser.onContextMenuClick(async (menuItemId, tab) => {
  if (menuItemId === MENU_ID_FILL) {
    await handleDirectAction('fill', tab);
  } else if (menuItemId === MENU_ID_RECORD) {
    await handleDirectAction('record', tab);
  }
});

browser.onCommand(async (command) => {
  if (command === COMMAND_FILL) {
    await handleDirectAction('fill', null);
  } else if (command === COMMAND_RECORD) {
    await handleDirectAction('record', null);
  }
});
