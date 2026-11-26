import { RUNNER_KEY_FILL } from '../../core/constants';
import type { StorageRepository } from '../../core/storage';
import type { FeatureModule, FillOptions, FillResult } from '../../core/types';

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

          const profile = await storage.getActiveProfile(ctx.origin);
          if (!profile || profile.fields.length === 0) {
            ctx.notify('No fields saved for this profile', 'warn');
            return;
          }

          const settings = await storage.getSettings();
          const result = await ctx.browser.executeFileAndCall<FillOptions, FillResult>(
            ctx.activeTab.id,
            'scripts/fill.js',
            RUNNER_KEY_FILL,
            {
              fields: profile.fields,
              highlightFilled: settings.highlightFilled,
            }
          );

          const totalMatched = result.filledCount + result.unchangedCount;
          if (result.unmatchedLabels.length > 0) {
            ctx.notify(
              `Filled ${result.filledCount}/${profile.fields.length} (${result.unmatchedLabels.length} unmatched)`,
              'warn'
            );
          } else if (totalMatched === 0 && result.skippedDisabledCount > 0) {
            ctx.notify(
              `Skipped ${result.skippedDisabledCount} disabled/read-only field(s)`,
              'warn'
            );
          } else if (result.filledCount === 0 && result.unchangedCount > 0) {
            ctx.notify(`All ${result.unchangedCount} field(s) already up to date`, 'info');
          } else {
            ctx.notify(`Filled ${result.filledCount} field(s)!`, 'success');
          }
        },
      },
    ],
  };
}
