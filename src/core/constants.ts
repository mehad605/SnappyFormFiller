export const STORAGE_KEY = 'snappy_v3';
export const LEGACY_STORAGE_KEY = 'profiles';
export const CURRENT_SCHEMA_VERSION = 3 as const;

export const DEFAULT_PROFILE_ID = 'default';
export const DEFAULT_PROFILE_NAME = 'Default';

export const MAX_IMPORT_FILE_BYTES = 5 * 1024 * 1024; // 5 MiB
export const MAX_FIELD_VALUE_LENGTH = 100_000;
export const MAX_PROFILES_PER_SITE = 50;
export const MAX_PROFILE_NAME_LENGTH = 60;

export const HIGHLIGHT_DURATION_MS = 900;
export const OBJECT_URL_REVOKE_DELAY_MS = 10_000;

/**
 * Isolated-world runner keys used to pass structured-clone arguments into
 * self-contained esbuild-bundled page scripts and clean up immediately.
 */
export const RUNNER_KEY_RECORD = '__snappyFormFillerRecordRunner';
export const RUNNER_KEY_FILL = '__snappyFormFillerFillRunner';

export const FORBIDDEN_OBJECT_KEYS: ReadonlySet<string> = new Set([
  '__proto__',
  'constructor',
  'prototype',
]);

export const DEFAULT_SETTINGS = Object.freeze({
  skipPasswords: true,
  skipSensitiveFields: true,
  highlightFilled: true,
  skipEmptyOnRecord: false,
});
