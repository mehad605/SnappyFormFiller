import {
  CURRENT_SCHEMA_VERSION,
  DEFAULT_PROFILE_ID,
  DEFAULT_PROFILE_NAME,
  FORBIDDEN_OBJECT_KEYS,
  MAX_FIELD_VALUE_LENGTH,
  MAX_IMPORT_FILE_BYTES,
  MAX_PROFILES_PER_SITE,
  OBJECT_URL_REVOKE_DELAY_MS,
} from '../../core/constants';
import { parseSupportedOrigin } from '../../core/origin';
import { migrateLegacyField, sanitizeProfileName } from '../../core/storage';
import type {
  ExportBundleV3,
  FieldLocator,
  FormProfile,
  ImportSummary,
  LegacyFieldV2,
  RecordedField,
  SiteProfileCollection,
  StorageRootV3,
} from '../../core/types';

export interface ParsedImportPayload {
  sites: Record<string, SiteProfileCollection>;
  summary: ImportSummary;
}

export function createExportBundle(root: StorageRootV3): ExportBundleV3 {
  return {
    format: 'snappy-form-filler',
    schemaVersion: CURRENT_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    sites: root.sites,
  };
}

function validateLocator(raw: unknown): FieldLocator {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return {};
  }
  const src = raw as Record<string, unknown>;
  const locator: FieldLocator = {};
  const strKeys = [
    'id',
    'name',
    'testId',
    'ariaLabel',
    'labelText',
    'placeholder',
    'cssPath',
    'frameOrigin',
    'framePath',
  ] as const;

  for (const key of strKeys) {
    const val = src[key];
    if (typeof val === 'string' && val.trim()) {
      locator[key] = val.trim().slice(0, 500);
    }
  }
  if (typeof src['index'] === 'number' && Number.isInteger(src['index']) && src['index'] >= 0) {
    locator.index = src['index'];
  }
  if (typeof src['inShadowDom'] === 'boolean') {
    locator.inShadowDom = src['inShadowDom'];
  }
  return locator;
}

function validateFieldV3(raw: unknown, path: string): RecordedField {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error(`${path} must be an object`);
  }
  const obj = raw as Record<string, unknown>;
  const type = typeof obj['type'] === 'string' && obj['type'].trim() ? obj['type'].trim() : 'text';

  let value: string | string[];
  if (Array.isArray(obj['value'])) {
    value = obj['value'].map((v) => {
      if (typeof v !== 'string') throw new Error(`${path}.value array entries must be strings`);
      if (v.length > MAX_FIELD_VALUE_LENGTH)
        throw new Error(`${path}.value exceeds maximum length`);
      return v;
    });
  } else if (typeof obj['value'] === 'string') {
    if (obj['value'].length > MAX_FIELD_VALUE_LENGTH) {
      throw new Error(`${path}.value exceeds maximum length`);
    }
    value = obj['value'];
  } else {
    value = '';
  }

  const locator = validateLocator(obj['locator']);
  const label =
    typeof obj['label'] === 'string' && obj['label'].trim()
      ? obj['label'].trim().slice(0, 80)
      : (locator.labelText ?? locator.name ?? locator.id ?? type);

  const isCheckable = type === 'checkbox' || type === 'radio';
  return {
    label,
    type,
    value,
    ...(isCheckable ? { checked: Boolean(obj['checked']) } : {}),
    ...(obj['sensitive'] === true || type === 'password' ? { sensitive: true } : {}),
    locator,
  };
}

function parseV3Sites(rawSites: unknown): ParsedImportPayload {
  if (!rawSites || typeof rawSites !== 'object' || Array.isArray(rawSites)) {
    throw new Error('Invalid v3 bundle: "sites" must be an object');
  }

  const sites: Record<string, SiteProfileCollection> = Object.create(null);
  let profileCount = 0;
  let fieldCount = 0;

  for (const [rawOrigin, rawCollection] of Object.entries(rawSites as Record<string, unknown>)) {
    if (FORBIDDEN_OBJECT_KEYS.has(rawOrigin)) {
      throw new Error(`Disallowed key "${rawOrigin}" in import payload`);
    }
    const origin = parseSupportedOrigin(rawOrigin);
    if (!origin) {
      throw new Error(`Invalid site origin "${rawOrigin}"`);
    }
    if (!rawCollection || typeof rawCollection !== 'object' || Array.isArray(rawCollection)) {
      throw new Error(`Site "${origin}" must contain a profile collection`);
    }

    const col = rawCollection as Record<string, unknown>;
    if (!Array.isArray(col['profiles'])) {
      throw new Error(`Site "${origin}" is missing a profiles array`);
    }
    if (col['profiles'].length > MAX_PROFILES_PER_SITE) {
      throw new Error(`Site "${origin}" exceeds maximum of ${MAX_PROFILES_PER_SITE} profiles`);
    }

    const seenIds = new Set<string>();
    const profiles: FormProfile[] = [];

    for (let i = 0; i < col['profiles'].length; i += 1) {
      const rawProfile = col['profiles'][i];
      if (!rawProfile || typeof rawProfile !== 'object' || Array.isArray(rawProfile)) {
        throw new Error(`${origin}.profiles[${i}] must be an object`);
      }
      const p = rawProfile as Record<string, unknown>;
      const id =
        typeof p['id'] === 'string' && p['id'].trim() && !FORBIDDEN_OBJECT_KEYS.has(p['id'])
          ? p['id'].trim().slice(0, 64)
          : `imported_${i}`;
      if (seenIds.has(id)) continue;
      seenIds.add(id);

      const rawFields = p['fields'];
      if (!Array.isArray(rawFields)) {
        throw new Error(`${origin}.profiles[${i}].fields must be an array`);
      }
      const fields = rawFields.map((f, j) =>
        validateFieldV3(f, `${origin}.profiles[${i}].fields[${j}]`)
      );
      fieldCount += fields.length;

      profiles.push({
        id,
        name: sanitizeProfileName(typeof p['name'] === 'string' ? p['name'] : DEFAULT_PROFILE_NAME),
        updatedAt:
          typeof p['updatedAt'] === 'number' && Number.isFinite(p['updatedAt'])
            ? p['updatedAt']
            : Date.now(),
        fields,
      });
    }

    if (profiles.length > 0) {
      const requestedActive =
        typeof col['activeProfileId'] === 'string' ? col['activeProfileId'] : '';
      const activeProfileId = profiles.some((p) => p.id === requestedActive)
        ? requestedActive
        : profiles[0]!.id;
      sites[origin] = { activeProfileId, profiles };
      profileCount += profiles.length;
    }
  }

  return {
    sites,
    summary: {
      siteCount: Object.keys(sites).length,
      profileCount,
      fieldCount,
      sourceVersion: 3,
    },
  };
}

function parseLegacyV2Payload(rawObj: Record<string, unknown>): ParsedImportPayload {
  const sites: Record<string, SiteProfileCollection> = Object.create(null);
  let profileCount = 0;
  let fieldCount = 0;
  const now = Date.now();

  for (const [rawOrigin, rawFields] of Object.entries(rawObj)) {
    if (FORBIDDEN_OBJECT_KEYS.has(rawOrigin)) {
      throw new Error(`Disallowed key "${rawOrigin}" in import payload`);
    }
    const origin = parseSupportedOrigin(rawOrigin);
    if (!origin) {
      throw new Error(`Invalid site origin "${rawOrigin}"`);
    }
    if (!Array.isArray(rawFields)) {
      throw new Error(`Expected field array for "${origin}"`);
    }
    const fields: RecordedField[] = [];
    for (let i = 0; i < rawFields.length; i += 1) {
      const item = rawFields[i];
      if (!item || typeof item !== 'object' || Array.isArray(item)) {
        throw new Error(`${origin}[${i}] is not a valid field object`);
      }
      const migrated = migrateLegacyField(item as LegacyFieldV2);
      if (typeof migrated.value === 'string' && migrated.value.length > MAX_FIELD_VALUE_LENGTH) {
        throw new Error(`${origin}[${i}].value exceeds maximum length`);
      }
      fields.push(migrated);
    }
    if (fields.length > 0) {
      sites[origin] = {
        activeProfileId: DEFAULT_PROFILE_ID,
        profiles: [
          {
            id: DEFAULT_PROFILE_ID,
            name: DEFAULT_PROFILE_NAME,
            updatedAt: now,
            fields,
          },
        ],
      };
      profileCount += 1;
      fieldCount += fields.length;
    }
  }

  return {
    sites,
    summary: {
      siteCount: Object.keys(sites).length,
      profileCount,
      fieldCount,
      sourceVersion: 2,
    },
  };
}

/**
 * Safely parses and validates both v3.0 export bundles and legacy v2.0 profile exports.
 * Guards against oversized files, prototype pollution, invalid origins, and malformed schemas.
 */
export function parseImportJson(rawText: string): ParsedImportPayload {
  if (typeof rawText !== 'string' || !rawText.trim()) {
    throw new Error('Import file is empty');
  }
  const byteSize = new TextEncoder().encode(rawText).byteLength;
  if (byteSize > MAX_IMPORT_FILE_BYTES) {
    throw new Error(
      `Import file exceeds ${(MAX_IMPORT_FILE_BYTES / (1024 * 1024)).toFixed(0)} MB limit`
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawText, (key, value: unknown) => {
      if (FORBIDDEN_OBJECT_KEYS.has(key)) {
        throw new Error(`Disallowed key "${key}" in JSON`);
      }
      return value;
    });
  } catch (err) {
    if (err instanceof Error && err.message.startsWith('Disallowed key')) {
      throw err;
    }
    throw new Error('Invalid JSON syntax');
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('JSON root must be an object');
  }

  const record = parsed as Record<string, unknown>;
  if (
    record['format'] === 'snappy-form-filler' &&
    record['schemaVersion'] === CURRENT_SCHEMA_VERSION
  ) {
    return parseV3Sites(record['sites']);
  }

  return parseLegacyV2Payload(record);
}

/**
 * Triggers a JSON download with delayed URL revocation to avoid Firefox/Chromium download races.
 */
export function triggerJsonDownload(bundle: ExportBundleV3): void {
  const json = `${JSON.stringify(bundle, null, 2)}\n`;
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `snappy-form-filler-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();

  globalThis.setTimeout(() => {
    URL.revokeObjectURL(url);
  }, OBJECT_URL_REVOKE_DELAY_MS);
}
