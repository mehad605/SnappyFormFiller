import { MessageRouter } from '../core/messaging';
import { StorageRepository } from '../core/storage';
import { createBackgroundFeatureRegistry } from '../features';
import { createBrowserAdapter } from '../platform/browser';

/**
 * Event-driven MV3 background service worker (Chromium) / event page (Firefox).
 * Zero timers, zero polling, zero persistent state — wakes only on install/update or messages.
 */
const browser = createBrowserAdapter();
const storage = new StorageRepository(browser);
const registry = createBackgroundFeatureRegistry(storage);
const router = new MessageRouter();

for (const [type, handler] of Object.entries(registry.getBackgroundHandlers())) {
  router.register(type, handler);
}

browser.onInstalled(async () => {
  await storage.migrateIfNeeded();
});

browser.onMessage((message) => router.dispatch(message));
