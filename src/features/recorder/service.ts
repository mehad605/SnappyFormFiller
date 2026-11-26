import { RUNNER_KEY_RECORD } from '../../core/constants';
import type { StorageRepository } from '../../core/storage';
import type { BrowserAdapter, RecordOptions, RecordResult } from '../../core/types';

export interface RecordExecutionOutcome {
  result: RecordResult;
  frameCount: number;
  message: string;
  tone: 'success' | 'warn';
}

/**
 * Shared recording workflow invoked by the Popup UI, Context Menu, and Global Hotkey.
 * Collects fields across the main document and all accessible iframes (same-origin by default,
 * plus cross-origin when optional host permission has been granted).
 */
export async function recordActiveTab(
  browser: BrowserAdapter,
  storage: StorageRepository,
  tabId: number,
  origin: string,
  profileId?: string
): Promise<RecordExecutionOutcome> {
  const settings = await storage.getSettings();
  const options: RecordOptions = {
    skipPasswords: settings.skipPasswords,
    skipSensitiveFields: settings.skipSensitiveFields,
    skipEmptyOnRecord: settings.skipEmptyOnRecord,
  };

  const frames = await browser.executeFileAndCallFrames<RecordOptions, RecordResult>(
    tabId,
    'scripts/record.js',
    RUNNER_KEY_RECORD,
    options,
    settings.includeIframes
  );

  const merged: RecordResult = {
    fields: [],
    skippedSensitive: 0,
    skippedEmpty: 0,
  };

  for (const frame of frames) {
    merged.fields.push(...frame.result.fields);
    merged.skippedSensitive += frame.result.skippedSensitive;
    merged.skippedEmpty += frame.result.skippedEmpty;
  }

  if (merged.fields.length === 0) {
    const extra =
      merged.skippedSensitive > 0 ? ` (${merged.skippedSensitive} sensitive skipped)` : '';
    return {
      result: merged,
      frameCount: frames.length,
      message: `No recordable form fields found${extra}`,
      tone: 'warn',
    };
  }

  await storage.saveProfileFields(origin, merged.fields, profileId);

  const notes: string[] = [];
  if (merged.skippedSensitive > 0) {
    notes.push(`${merged.skippedSensitive} sensitive skipped`);
  }
  if (merged.skippedEmpty > 0) {
    notes.push(`${merged.skippedEmpty} empty skipped`);
  }
  const suffix = notes.length > 0 ? ` (${notes.join(', ')})` : '';

  return {
    result: merged,
    frameCount: frames.length,
    message: `Recorded ${merged.fields.length} field(s)${suffix}`,
    tone: 'success',
  };
}
