import type { StorageRepository } from '../../core/storage';
import type { FeatureModule } from '../../core/types';
import { createExportBundle, triggerJsonDownload } from './serializer';

export interface PortabilityFeatureOptions {
  storage: StorageRepository;
  onRequestPopupImport?: () => void;
}

export function createPortabilityFeature(options: PortabilityFeatureOptions): FeatureModule {
  const { storage, onRequestPopupImport } = options;

  return {
    id: 'portability',
    name: 'Import & Export',
    description: 'Exports and imports profiles as validated JSON (supports v2.0 and v3.0 files).',
    popupActions: [
      {
        id: 'export',
        label: 'Export',
        slot: 'utility',
        variant: 'neutral',
        requiresOrigin: false,
        order: 10,
        async execute(ctx) {
          const root = await storage.load();
          const siteCount = Object.keys(root.sites).length;
          if (siteCount === 0) {
            ctx.notify('Nothing to export yet', 'warn');
            return;
          }
          triggerJsonDownload(createExportBundle(root));
          ctx.notify(`Exported ${siteCount} site(s)`, 'success');
        },
      },
      {
        id: 'import',
        label: 'Import',
        slot: 'utility',
        variant: 'neutral',
        requiresOrigin: false,
        order: 20,
        async execute(ctx) {
          if (!ctx.browser.supportsPopupFilePicker() || !onRequestPopupImport) {
            // Firefox closes popups when a file picker opens; route seamlessly to full-page Options.
            await ctx.browser.openOptionsPage('#import');
            return;
          }
          onRequestPopupImport();
        },
      },
    ],
  };
}
