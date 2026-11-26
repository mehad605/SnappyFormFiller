import { describe, expect, it } from 'vitest';
import { LEGACY_STORAGE_KEY, STORAGE_KEY } from '../../src/core/constants';
import { StorageRepository } from '../../src/core/storage';
import type { RecordedField } from '../../src/core/types';
import { createMockBrowser } from '../helpers/mock-browser';

const sampleField: RecordedField = {
  label: 'Email',
  type: 'email',
  value: 'alice@example.com',
  locator: { id: 'email', name: 'email' },
};

describe('StorageRepository', () => {
  it('migrates legacy v2.0 profiles automatically on first load', async () => {
    const mock = createMockBrowser({
      initialStorage: {
        [LEGACY_STORAGE_KEY]: {
          'https://legacy.example': [
            { id: 'email', name: 'email', type: 'email', value: 'v2@example.com' },
            { id: 'agree', name: 'agree', type: 'checkbox', value: 'yes', checked: true },
          ],
          'chrome://invalid': [{ id: 'x', name: 'x', type: 'text', value: 'bad' }],
        },
      },
    });
    const repo = new StorageRepository(mock.adapter);

    const root = await repo.load();
    expect(root.schemaVersion).toBe(3);
    expect(Object.keys(root.sites)).toEqual(['https://legacy.example']);

    const profile = await repo.getActiveProfile('https://legacy.example');
    expect(profile?.name).toBe('Default');
    expect(profile?.fields).toHaveLength(2);
    expect(profile?.fields[0]?.value).toBe('v2@example.com');
    expect(profile?.fields[1]?.checked).toBe(true);
    expect(mock.storage.has(STORAGE_KEY)).toBe(true);
  });

  it('supports creating, switching, renaming, duplicating, and deleting multiple profiles', async () => {
    const mock = createMockBrowser();
    const repo = new StorageRepository(mock.adapter);
    const origin = 'https://app.local';

    const p1 = await repo.saveProfileFields(origin, [sampleField]);
    const p2 = await repo.createProfile(origin, 'Admin User', [
      { ...sampleField, value: 'admin@app.local' },
    ]);

    let site = await repo.getSite(origin);
    expect(site?.profiles).toHaveLength(2);
    expect(site?.activeProfileId).toBe(p2.id);

    await repo.renameProfile(origin, p2.id, 'Super Admin');
    const copy = await repo.duplicateProfile(origin, p2.id);
    expect(copy?.name).toBe('Super Admin (copy)');

    await repo.setActiveProfile(origin, p1.id);
    expect((await repo.getActiveProfile(origin))?.id).toBe(p1.id);

    await repo.deleteProfile(origin, p1.id);
    site = await repo.getSite(origin);
    expect(site?.profiles).toHaveLength(2);
    expect(site?.activeProfileId).toBe(p2.id);
  });

  it('serializes concurrent mutations without losing writes', async () => {
    const mock = createMockBrowser();
    const repo = new StorageRepository(mock.adapter);

    await Promise.all([
      repo.saveProfileFields('https://a.example', [sampleField]),
      repo.saveProfileFields('https://b.example', [sampleField]),
      repo.saveProfileFields('https://c.example', [sampleField]),
    ]);

    const root = await repo.load();
    expect(Object.keys(root.sites).sort()).toEqual([
      'https://a.example',
      'https://b.example',
      'https://c.example',
    ]);
  });

  it('refuses to save or clear unsupported origins', async () => {
    const mock = createMockBrowser();
    const repo = new StorageRepository(mock.adapter);

    await expect(repo.saveProfileFields('chrome://extensions', [sampleField])).rejects.toThrow(
      /unsupported origin/i
    );
    expect(await repo.clearSite('chrome://extensions')).toBe(false);
  });
});
