import type { StorageRepository } from '../../core/storage';
import type { FeatureModule } from '../../core/types';

/**
 * Example FeatureModule template.
 *
 * Copy this folder to `src/features/<your-feature>/`, customize the logic, and register
 * `createExampleStatsFeature(storage)` in `src/features/index.ts`.
 * No edits to `popup.ts`, `background/index.ts`, or `platform/browser.ts` are required.
 */
export function createExampleStatsFeature(storage: StorageRepository): FeatureModule {
  return {
    id: 'example-stats',
    name: 'Profile Stats (Example Template)',
    description: 'Counts saved sites and fields across local storage.',
    popupActions: [
      {
        id: 'example-show-stats',
        label: 'Stats',
        slot: 'utility',
        variant: 'neutral',
        requiresOrigin: false,
        order: 90,
        async execute(ctx) {
          const root = await storage.load();
          const sites = Object.values(root.sites);
          const totalProfiles = sites.reduce((acc, s) => acc + s.profiles.length, 0);
          const totalFields = sites.reduce(
            (acc, s) => acc + s.profiles.reduce((pAcc, p) => pAcc + p.fields.length, 0),
            0
          );
          ctx.notify(
            `${sites.length} site(s), ${totalProfiles} profile(s), ${totalFields} field(s)`,
            'info'
          );
        },
      },
    ],
  };
}
