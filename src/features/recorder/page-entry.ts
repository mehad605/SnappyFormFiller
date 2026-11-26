import { RUNNER_KEY_RECORD } from '../../core/constants';
import type { RecordOptions, RecordResult } from '../../core/types';
import { collectFormFields } from './dom-collector';

/**
 * Self-contained page-injected entry point compiled as an IIFE by esbuild.
 * Registers the runner in the isolated world; invoked and deleted immediately by BrowserAdapter.
 */
(globalThis as Record<string, unknown>)[RUNNER_KEY_RECORD] = (
  options: RecordOptions
): RecordResult => {
  return collectFormFields(document, options);
};
