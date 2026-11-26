import { RUNNER_KEY_RECORD } from '../../core/constants';
import type { StorageRepository } from '../../core/storage';
import type { FeatureModule, RecordOptions, RecordResult } from '../../core/types';

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

          const settings = await storage.getSettings();
          const options: RecordOptions = {
            skipPasswords: settings.skipPasswords,
            skipSensitiveFields: settings.skipSensitiveFields,
            skipEmptyOnRecord: settings.skipEmptyOnRecord,
          };

          const result = await ctx.browser.executeFileAndCall<RecordOptions, RecordResult>(
            ctx.activeTab.id,
            'scripts/record.js',
            RUNNER_KEY_RECORD,
            options
          );

          if (result.fields.length === 0) {
            const extra =
              result.skippedSensitive > 0 ? ` (${result.skippedSensitive} sensitive skipped)` : '';
            ctx.notify(`No recordable form fields found${extra}`, 'warn');
            return;
          }

          await storage.saveProfileFields(
            ctx.origin,
            result.fields,
            ctx.activeProfileId ?? undefined
          );

          const notes: string[] = [];
          if (result.skippedSensitive > 0) {
            notes.push(`${result.skippedSensitive} sensitive skipped`);
          }
          if (result.skippedEmpty > 0) {
            notes.push(`${result.skippedEmpty} empty skipped`);
          }
          const suffix = notes.length > 0 ? ` (${notes.join(', ')})` : '';
          ctx.notify(`Recorded ${result.fields.length} field(s)${suffix}`, 'success');
          await ctx.refresh();
        },
      },
    ],
  };
}
