import { describe, expect, it } from 'vitest';
import { MAX_IMPORT_FILE_BYTES } from '../../src/core/constants';
import type { StorageRootV3 } from '../../src/core/types';
import { createExportBundle, parseImportJson } from '../../src/features/portability/serializer';

describe('portability serializer', () => {
  it('round-trips a v3.0 export bundle cleanly', () => {
    const root: StorageRootV3 = {
      schemaVersion: 3,
      settings: {
        skipPasswords: true,
        skipSensitiveFields: true,
        highlightFilled: true,
        skipEmptyOnRecord: false,
        includeIframes: true,
      },
      sites: {
        'https://shop.example': {
          activeProfileId: 'default',
          profiles: [
            {
              id: 'default',
              name: 'Default',
              updatedAt: 1700000000000,
              fields: [
                {
                  label: 'Tags',
                  type: 'select-multiple',
                  value: ['a', 'b'],
                  locator: { name: 'tags' },
                },
              ],
            },
          ],
        },
      },
    };

    const json = JSON.stringify(createExportBundle(root));
    const parsed = parseImportJson(json);

    expect(parsed.summary).toEqual({
      siteCount: 1,
      profileCount: 1,
      fieldCount: 1,
      sourceVersion: 3,
    });
    expect(parsed.sites['https://shop.example']?.profiles[0]?.fields[0]?.value).toEqual(['a', 'b']);
  });

  it('imports legacy v2.0 JSON backups seamlessly', () => {
    const legacyJson = JSON.stringify({
      'https://legacy.example': [
        { id: 'user', name: 'user', type: 'text', value: 'ada' },
        { id: 'optin', name: 'optin', type: 'checkbox', value: 'on', checked: true },
      ],
    });

    const parsed = parseImportJson(legacyJson);
    expect(parsed.summary.sourceVersion).toBe(2);
    expect(parsed.summary.siteCount).toBe(1);
    expect(parsed.summary.fieldCount).toBe(2);
    expect(parsed.sites['https://legacy.example']?.profiles[0]?.fields[1]?.checked).toBe(true);
  });

  it('rejects prototype pollution payloads', () => {
    const malicious = '{"__proto__": {"polluted": true}}';
    expect(() => parseImportJson(malicious)).toThrow(/Disallowed key/);
  });

  it('rejects non-http(s) origins and malformed structures', () => {
    expect(() => parseImportJson(JSON.stringify({ 'javascript:alert(1)': [] }))).toThrow(
      /Invalid site origin/
    );
    expect(() => parseImportJson('[]')).toThrow(/object/);
    expect(() => parseImportJson('{bad json')).toThrow(/Invalid JSON/);
  });

  it('enforces maximum import file size limit', () => {
    const huge = 'a'.repeat(MAX_IMPORT_FILE_BYTES + 10);
    expect(() => parseImportJson(huge)).toThrow(/exceeds/i);
  });
});
