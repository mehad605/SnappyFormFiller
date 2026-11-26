import type { StorageRepository } from '../../core/storage';
import type { FeatureModule } from '../../core/types';
import { recordActiveTab } from './service';

export function createRecorderFeature(storage: StorageRepository): FeatureModule {
  return {
    id: 'recorder',
    name: 'Form Recorder',
    description: 'Captures current form field values on the active tab into the active profile.',
    popupActions: [
      {
        id: 'record',
        label: 'Record',
        slot: 'primary',
        variant: 'primary',
        shortcutKey: 'r',
        requiresOrigin: true,
        order: 10,
        async execute(ctx) {
          if (!ctx.activeTab || !ctx.origin) {
            ctx.notify('Cannot record on this page', 'warn');
            return;
          }

          const outcome = await recordActiveTab(
            ctx.browser,
            storage,
            ctx.activeTab.id,
            ctx.origin,
            ctx.activeProfileId ?? undefined
          );

          ctx.notify(outcome.message, outcome.tone);
          if (outcome.tone === 'success') {
            await ctx.refresh();
          }
        },
      },
    ],
  };
}
