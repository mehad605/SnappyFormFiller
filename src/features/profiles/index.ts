import type { StorageRepository } from '../../core/storage';
import type { FeatureModule } from '../../core/types';

export function createProfilesFeature(storage: StorageRepository): FeatureModule {
  return {
    id: 'profiles',
    name: 'Profile Management',
    description: 'Manages per-site profile clearing and storage summary queries.',
    popupActions: [
      {
        id: 'clear-site',
        label: 'Clear Site',
        slot: 'secondary',
        variant: 'danger',
        requiresOrigin: true,
        order: 10,
        async execute(ctx) {
          if (!ctx.origin) {
            ctx.notify('No valid site to clear', 'warn');
            return;
          }
          const site = await storage.getSite(ctx.origin);
          if (!site || site.profiles.length === 0) {
            ctx.notify('Nothing saved for this site', 'info');
            return;
          }
          const confirmed = await ctx.requestConfirm({
            message: `Delete all ${site.profiles.length} profile(s) for ${ctx.origin}?`,
            confirmLabel: 'Clear Site',
            variant: 'danger',
          });
          if (!confirmed) return;

          await storage.clearSite(ctx.origin);
          ctx.notify('Site data cleared', 'info');
          await ctx.refresh();
        },
      },
      {
        id: 'clear-all',
        label: 'Clear All',
        slot: 'secondary',
        variant: 'danger',
        requiresOrigin: false,
        order: 20,
        async execute(ctx) {
          const root = await storage.load();
          const siteCount = Object.keys(root.sites).length;
          if (siteCount === 0) {
            ctx.notify('No saved profiles to clear', 'info');
            return;
          }
          const confirmed = await ctx.requestConfirm({
            message: `Delete all saved profiles across ${siteCount} site(s)?`,
            confirmLabel: 'Delete All',
            variant: 'danger',
          });
          if (!confirmed) return;

          await storage.clearAll();
          ctx.notify('All profiles cleared', 'info');
          await ctx.refresh();
        },
      },
    ],
    backgroundHandlers: {
      'profiles:summary': async () => {
        const root = await storage.load();
        const siteCount = Object.keys(root.sites).length;
        let profileCount = 0;
        let fieldCount = 0;
        for (const site of Object.values(root.sites)) {
          profileCount += site.profiles.length;
          for (const profile of site.profiles) {
            fieldCount += profile.fields.length;
          }
        }
        return { siteCount, profileCount, fieldCount };
      },
    },
  };
}
