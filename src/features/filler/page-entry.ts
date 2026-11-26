import { RUNNER_KEY_FILL } from '../../core/constants';
import type { FillOptions, FillResult } from '../../core/types';
import { fillFormFields } from './framework-setter';

/**
 * Self-contained page-injected entry point compiled as an IIFE by esbuild.
 * Eliminates the v2.0 serialized closure bug structurally by bundling all helpers inside.
 */
(globalThis as Record<string, unknown>)[RUNNER_KEY_FILL] = (options: FillOptions): FillResult => {
  return fillFormFields(document, options);
};
