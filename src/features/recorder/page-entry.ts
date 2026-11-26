import { RUNNER_KEY_RECORD } from '../../core/constants';
import type { RecordOptions, RecordResult } from '../../core/types';
import { getOpenOrClosedShadowRoot } from '../../platform/shadow-root';
import { collectFormFields, type FrameContextMeta } from './dom-collector';

function detectFrameMeta(): FrameContextMeta {
  let isSubframe = false;
  try {
    isSubframe = window !== window.top;
  } catch {
    isSubframe = true;
  }
  return {
    isSubframe,
    origin: location.origin,
    pathname: location.pathname,
  };
}

/**
 * Self-contained page-injected entry point compiled as an IIFE by esbuild.
 * Registers the runner in the isolated world; invoked and deleted immediately by BrowserAdapter.
 */
(globalThis as Record<string, unknown>)[RUNNER_KEY_RECORD] = (
  options: RecordOptions
): RecordResult => {
  return collectFormFields(document, options, getOpenOrClosedShadowRoot, detectFrameMeta());
};
