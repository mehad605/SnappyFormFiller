import { RUNNER_KEY_FILL } from '../../core/constants';
import type { FillOptions, FillResult } from '../../core/types';
import { getOpenOrClosedShadowRoot } from '../../platform/shadow-root';
import { fillFormFields, type FillFrameMeta } from './framework-setter';

function detectFrameMeta(): FillFrameMeta {
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
 * Eliminates the v2.0 serialized closure bug structurally by bundling all helpers inside.
 */
(globalThis as Record<string, unknown>)[RUNNER_KEY_FILL] = (options: FillOptions): FillResult => {
  return fillFormFields(document, options, getOpenOrClosedShadowRoot, detectFrameMeta());
};
