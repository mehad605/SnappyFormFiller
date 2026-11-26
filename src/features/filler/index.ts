import type { StorageRepository } from '../../core/storage';
import type { FeatureModule } from '../../core/types';
import { fillActiveTab } from './service';

export function createFillerFeature(storage: StorageRepository): FeatureModule {
  return {
    id: 'filler',
    name: 'Framework-Aware Filler',
    description: 'Replays saved fields into the active tab using framework-compatible setters.',
    popupActions: [
      {
        id: 'fill',
        label: 'Fill',
        slot: 'primary',
        variant: 'accent',
        shortcutKey: 'f',
        requiresOrigin: true,
        order: 20,
        async execute(ctx) {
          if (!ctx.activeTab || !ctx.origin) {
            ctx.notify('Cannot fill on this page', 'warn');
            return;
          }

          const outcome = await fillActiveTab(ctx.browser, storage, ctx.activeTab.id, ctx.origin);
          ctx.notify(outcome.message, outcome.tone);
        },
      },
    ],
  };
}
