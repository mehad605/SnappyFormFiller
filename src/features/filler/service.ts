import { RUNNER_KEY_FILL } from '../../core/constants';
import type { StorageRepository } from '../../core/storage';
import type { BrowserAdapter, FillOptions, FillResult, RecordedField } from '../../core/types';

export interface FillExecutionOutcome {
  result: FillResult | null;
  message: string;
  tone: 'success' | 'warn' | 'info';
}

export function aggregateFrameFillResults(
  fields: readonly RecordedField[],
  frameResults: readonly FillResult[]
): FillResult {
  let filledCount = 0;
  let unchangedCount = 0;
  let skippedDisabledCount = 0;
  const matchedSet = new Set<number>();

  for (const res of frameResults) {
    filledCount += res.filledCount;
    unchangedCount += res.unchangedCount;
    skippedDisabledCount += res.skippedDisabledCount;
    if (res.matchedIndices) {
      for (const idx of res.matchedIndices) matchedSet.add(idx);
    }
  }

  // If frameResults did not include matchedIndices (e.g. legacy mock), fall back to union of unmatchedLabels.
  const hasIndices = frameResults.some((r) => Array.isArray(r.matchedIndices));
  const unmatchedLabels: string[] = hasIndices
    ? fields
        .map((field, idx) => ({ field, idx }))
        .filter(({ idx }) => !matchedSet.has(idx))
        .map(({ field }) => field.label || field.locator.id || field.locator.name || field.type)
    : frameResults.flatMap((r) => r.unmatchedLabels);

  return {
    filledCount,
    unchangedCount,
    skippedDisabledCount,
    unmatchedLabels,
  };
}

/**
 * Shared fill workflow invoked by the Popup UI, Context Menu, and Global Hotkey.
 */
export async function fillActiveTab(
  browser: BrowserAdapter,
  storage: StorageRepository,
  tabId: number,
  origin: string
): Promise<FillExecutionOutcome> {
  const profile = await storage.getActiveProfile(origin);
  if (!profile || profile.fields.length === 0) {
    return {
      result: null,
      message: 'No fields saved for this profile',
      tone: 'warn',
    };
  }

  const settings = await storage.getSettings();
  const hasIframeFields = profile.fields.some((f) => Boolean(f.locator.frameOrigin));
  const allFrames = settings.includeIframes || hasIframeFields;

  const frames = await browser.executeFileAndCallFrames<FillOptions, FillResult>(
    tabId,
    'scripts/fill.js',
    RUNNER_KEY_FILL,
    {
      fields: profile.fields,
      highlightFilled: settings.highlightFilled,
    },
    allFrames
  );

  const result = aggregateFrameFillResults(
    profile.fields,
    frames.map((f) => f.result)
  );

  const totalMatched = result.filledCount + result.unchangedCount;
  if (result.unmatchedLabels.length > 0) {
    return {
      result,
      message: `Filled ${result.filledCount}/${profile.fields.length} (${result.unmatchedLabels.length} unmatched)`,
      tone: 'warn',
    };
  }
  if (totalMatched === 0 && result.skippedDisabledCount > 0) {
    return {
      result,
      message: `Skipped ${result.skippedDisabledCount} disabled/read-only field(s)`,
      tone: 'warn',
    };
  }
  if (result.filledCount === 0 && result.unchangedCount > 0) {
    return {
      result,
      message: `All ${result.unchangedCount} field(s) already up to date`,
      tone: 'info',
    };
  }
  return {
    result,
    message: `Filled ${result.filledCount} field(s)!`,
    tone: 'success',
  };
}
