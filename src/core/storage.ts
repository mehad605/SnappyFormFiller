import {
  CURRENT_SCHEMA_VERSION,
  DEFAULT_PROFILE_ID,
  DEFAULT_PROFILE_NAME,
  DEFAULT_SETTINGS,
  FORBIDDEN_OBJECT_KEYS,
  LEGACY_STORAGE_KEY,
  MAX_PROFILES_PER_SITE,
  MAX_PROFILE_NAME_LENGTH,
  STORAGE_KEY,
} from './constants';
import { parseSupportedOrigin } from './origin';
import type {
  BrowserAdapter,
  ExtensionSettings,
  FormProfile,
  LegacyFieldV2,
  RecordedField,
  SiteProfileCollection,
  StorageRootV3,
} from './types';

function createEmptyRoot(): StorageRootV3 {
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    settings: { ...DEFAULT_SETTINGS },
    sites: Object.create(null) as Record<string, SiteProfileCollection>,
  };
}

function createProfileId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `p_${crypto.randomUUID().slice(0, 8)}`;
  }
  return `p_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

export function sanitizeProfileName(name: string): string {
  const cleaned = name.trim().replace(/\s+/g, ' ').slice(0, MAX_PROFILE_NAME_LENGTH);
  return cleaned || DEFAULT_PROFILE_NAME;
}

/**
 * Converts a legacy v2.0 field record ({ id, name, type, value, checked }) into a v3 RecordedField.
 */
export function migrateLegacyField(legacy: LegacyFieldV2): RecordedField {
  const type = typeof legacy.type === 'string' && legacy.type ? legacy.type : 'text';
  const id = typeof legacy.id === 'string' && legacy.id ? legacy.id : undefined;
  const name = typeof legacy.name === 'string' && legacy.name ? legacy.name : undefined;
  const label = id ?? name ?? type;
  const isCheckable = type === 'checkbox' || type === 'radio';

  return {
    label,
    type,
    value: typeof legacy.value === 'string' ? legacy.value : '',
    ...(isCheckable ? { checked: Boolean(legacy.checked) } : {}),
    ...(type === 'password' ? { sensitive: true } : {}),
    locator: {
      ...(id ? { id } : {}),
      ...(name ? { name } : {}),
    },
  };
}

/**
 * Migrates v2.0 `{ profiles: { [origin]: LegacyFieldV2[] } }` storage into v3 StorageRootV3.
 */
export function migrateLegacyStorage(
  legacyProfiles: Record<string, unknown>,
  now = Date.now()
): StorageRootV3 {
  const root = createEmptyRoot();
  for (const [rawOrigin, rawFields] of Object.entries(legacyProfiles)) {
    if (FORBIDDEN_OBJECT_KEYS.has(rawOrigin)) continue;
    const origin = parseSupportedOrigin(rawOrigin);
    if (!origin || !Array.isArray(rawFields)) continue;

    const fields: RecordedField[] = [];
    for (const item of rawFields) {
      if (item && typeof item === 'object' && !Array.isArray(item)) {
        fields.push(migrateLegacyField(item as LegacyFieldV2));
      }
    }

    if (fields.length > 0) {
      root.sites[origin] = {
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
    }
  }
  return root;
}

function clonePlainRoot(root: StorageRootV3): StorageRootV3 {
  const sites: Record<string, SiteProfileCollection> = {};
  for (const [origin, collection] of Object.entries(root.sites)) {
    if (FORBIDDEN_OBJECT_KEYS.has(origin)) continue;
    sites[origin] = {
      activeProfileId: collection.activeProfileId,
      profiles: collection.profiles.map((p) => ({
        id: p.id,
        name: p.name,
        updatedAt: p.updatedAt,
        fields: p.fields.map((f) => ({
          ...f,
          value: Array.isArray(f.value) ? [...f.value] : f.value,
          locator: { ...f.locator },
        })),
      })),
    };
  }
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    settings: {
      ...DEFAULT_SETTINGS,
      ...root.settings,
    },
    sites,
  };
}

function isStorageRootV3(value: unknown): value is StorageRootV3 {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  const candidate = value as Partial<StorageRootV3>;
  return (
    candidate.schemaVersion === CURRENT_SCHEMA_VERSION &&
    typeof candidate.sites === 'object' &&
    candidate.sites !== null &&
    !Array.isArray(candidate.sites)
  );
}

/**
 * Isolated persistence layer for all extension state.
 * Serializes mutations through a write queue to prevent lost updates during rapid UI edits.
 */
export class StorageRepository {
  private writeQueue: Promise<unknown> = Promise.resolve();

  constructor(private readonly browser: BrowserAdapter) {}

  private enqueue<T>(task: () => Promise<T>): Promise<T> {
    const next = this.writeQueue.then(task, task);
    this.writeQueue = next.then(
      () => undefined,
      () => undefined
    );
    return next;
  }

  /**
   * Loads v3 storage, transparently migrating v2.0 `profiles` on first access.
   */
  async load(): Promise<StorageRootV3> {
    const raw = await this.browser.storageGet<unknown>([STORAGE_KEY, LEGACY_STORAGE_KEY]);
    const current = raw[STORAGE_KEY];
    if (isStorageRootV3(current)) {
      return clonePlainRoot(current);
    }

    const legacy = raw[LEGACY_STORAGE_KEY];
    if (legacy && typeof legacy === 'object' && !Array.isArray(legacy)) {
      const migrated = migrateLegacyStorage(legacy as Record<string, unknown>);
      await this.browser.storageSet({ [STORAGE_KEY]: clonePlainRoot(migrated) });
      return clonePlainRoot(migrated);
    }

    return createEmptyRoot();
  }

  async migrateIfNeeded(): Promise<boolean> {
    const raw = await this.browser.storageGet<unknown>([STORAGE_KEY, LEGACY_STORAGE_KEY]);
    if (isStorageRootV3(raw[STORAGE_KEY])) {
      return false;
    }
    const legacy = raw[LEGACY_STORAGE_KEY];
    if (legacy && typeof legacy === 'object' && !Array.isArray(legacy)) {
      const migrated = migrateLegacyStorage(legacy as Record<string, unknown>);
      await this.browser.storageSet({ [STORAGE_KEY]: clonePlainRoot(migrated) });
      return true;
    }
    return false;
  }

  private async mutate<T>(updater: (root: StorageRootV3) => T): Promise<T> {
    return this.enqueue(async () => {
      const root = await this.load();
      const result = updater(root);
      await this.browser.storageSet({ [STORAGE_KEY]: clonePlainRoot(root) });
      return result;
    });
  }

  async getSite(origin: string): Promise<SiteProfileCollection | null> {
    const normalized = parseSupportedOrigin(origin);
    if (!normalized) return null;
    const root = await this.load();
    return root.sites[normalized] ?? null;
  }

  async getActiveProfile(origin: string): Promise<FormProfile | null> {
    const site = await this.getSite(origin);
    if (!site || site.profiles.length === 0) return null;
    return site.profiles.find((p) => p.id === site.activeProfileId) ?? site.profiles[0] ?? null;
  }

  async saveProfileFields(
    origin: string,
    fields: RecordedField[],
    profileId?: string
  ): Promise<FormProfile> {
    const normalized = parseSupportedOrigin(origin);
    if (!normalized) {
      throw new Error('Cannot save profile for an unsupported origin');
    }

    return this.mutate((root) => {
      let site = root.sites[normalized];
      if (!site) {
        site = {
          activeProfileId: DEFAULT_PROFILE_ID,
          profiles: [
            {
              id: DEFAULT_PROFILE_ID,
              name: DEFAULT_PROFILE_NAME,
              updatedAt: Date.now(),
              fields: [],
            },
          ],
        };
        root.sites[normalized] = site;
      }

      const targetId = profileId ?? site.activeProfileId;
      let profile = site.profiles.find((p) => p.id === targetId);
      if (!profile) {
        profile = site.profiles[0] ?? {
          id: DEFAULT_PROFILE_ID,
          name: DEFAULT_PROFILE_NAME,
          updatedAt: Date.now(),
          fields: [],
        };
        if (!site.profiles.includes(profile)) {
          site.profiles.push(profile);
        }
      }

      profile.fields = fields;
      profile.updatedAt = Date.now();
      site.activeProfileId = profile.id;
      return profile;
    });
  }

  async createProfile(
    origin: string,
    name: string,
    initialFields: RecordedField[] = []
  ): Promise<FormProfile> {
    const normalized = parseSupportedOrigin(origin);
    if (!normalized) {
      throw new Error('Cannot create profile for an unsupported origin');
    }
    const cleanName = sanitizeProfileName(name);

    return this.mutate((root) => {
      const site = root.sites[normalized] ?? { activeProfileId: '', profiles: [] };
      if (site.profiles.length >= MAX_PROFILES_PER_SITE) {
        throw new Error(`Maximum of ${MAX_PROFILES_PER_SITE} profiles per site reached`);
      }
      const profile: FormProfile = {
        id: site.profiles.length === 0 ? DEFAULT_PROFILE_ID : createProfileId(),
        name: cleanName,
        updatedAt: Date.now(),
        fields: initialFields,
      };
      site.profiles.push(profile);
      site.activeProfileId = profile.id;
      root.sites[normalized] = site;
      return profile;
    });
  }

  async setActiveProfile(origin: string, profileId: string): Promise<void> {
    const normalized = parseSupportedOrigin(origin);
    if (!normalized) return;
    await this.mutate((root) => {
      const site = root.sites[normalized];
      if (!site) return;
      if (site.profiles.some((p) => p.id === profileId)) {
        site.activeProfileId = profileId;
      }
    });
  }

  async renameProfile(origin: string, profileId: string, newName: string): Promise<void> {
    const normalized = parseSupportedOrigin(origin);
    if (!normalized) return;
    const cleanName = sanitizeProfileName(newName);
    await this.mutate((root) => {
      const profile = root.sites[normalized]?.profiles.find((p) => p.id === profileId);
      if (profile) {
        profile.name = cleanName;
        profile.updatedAt = Date.now();
      }
    });
  }

  async duplicateProfile(origin: string, profileId: string): Promise<FormProfile | null> {
    const normalized = parseSupportedOrigin(origin);
    if (!normalized) return null;
    return this.mutate((root) => {
      const site = root.sites[normalized];
      const source = site?.profiles.find((p) => p.id === profileId);
      if (!site || !source) return null;
      if (site.profiles.length >= MAX_PROFILES_PER_SITE) {
        throw new Error(`Maximum of ${MAX_PROFILES_PER_SITE} profiles per site reached`);
      }
      const copy: FormProfile = {
        id: createProfileId(),
        name: sanitizeProfileName(`${source.name} (copy)`),
        updatedAt: Date.now(),
        fields: source.fields.map((f) => ({
          ...f,
          value: Array.isArray(f.value) ? [...f.value] : f.value,
          locator: { ...f.locator },
        })),
      };
      site.profiles.push(copy);
      site.activeProfileId = copy.id;
      return copy;
    });
  }

  async deleteProfile(origin: string, profileId: string): Promise<void> {
    const normalized = parseSupportedOrigin(origin);
    if (!normalized) return;
    await this.mutate((root) => {
      const site = root.sites[normalized];
      if (!site) return;
      site.profiles = site.profiles.filter((p) => p.id !== profileId);
      if (site.profiles.length === 0) {
        delete root.sites[normalized];
      } else if (site.activeProfileId === profileId) {
        site.activeProfileId = site.profiles[0]!.id;
      }
    });
  }

  async clearSite(origin: string): Promise<boolean> {
    const normalized = parseSupportedOrigin(origin);
    if (!normalized) return false;
    return this.mutate((root) => {
      if (!(normalized in root.sites)) return false;
      delete root.sites[normalized];
      return true;
    });
  }

  async clearAll(): Promise<void> {
    await this.enqueue(async () => {
      const root = await this.load();
      root.sites = {};
      await this.browser.storageSet({ [STORAGE_KEY]: clonePlainRoot(root) });
      await this.browser.storageRemove([LEGACY_STORAGE_KEY]);
    });
  }

  async getSettings(): Promise<ExtensionSettings> {
    const root = await this.load();
    return { ...DEFAULT_SETTINGS, ...root.settings };
  }

  async updateSettings(patch: Partial<ExtensionSettings>): Promise<ExtensionSettings> {
    return this.mutate((root) => {
      root.settings = {
        ...DEFAULT_SETTINGS,
        ...root.settings,
        ...patch,
      };
      return { ...root.settings };
    });
  }

  async importSites(
    incomingSites: Record<string, SiteProfileCollection>,
    mode: 'merge' | 'replace'
  ): Promise<void> {
    await this.mutate((root) => {
      if (mode === 'replace') {
        root.sites = {};
      }
      for (const [origin, collection] of Object.entries(incomingSites)) {
        if (FORBIDDEN_OBJECT_KEYS.has(origin)) continue;
        const normalized = parseSupportedOrigin(origin);
        if (!normalized) continue;
        root.sites[normalized] = collection;
      }
    });
  }
}
