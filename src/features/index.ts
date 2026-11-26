import { FeatureRegistry } from '../core/feature-registry';
import type { StorageRepository } from '../core/storage';
import { createFillerFeature } from './filler';
import { createPortabilityFeature } from './portability';
import { createProfilesFeature } from './profiles';
import { createRecorderFeature } from './recorder';

export interface FeatureRegistryDependencies {
  storage: StorageRepository;
  onRequestPopupImport?: () => void;
}

/**
 * Registers all active feature modules for extension UI surfaces.
 * Adding a new feature only requires creating `src/features/<name>/` and registering it here.
 */
export function createFeatureRegistry(deps: FeatureRegistryDependencies): FeatureRegistry {
  const registry = new FeatureRegistry();
  registry
    .register(createRecorderFeature(deps.storage))
    .register(createFillerFeature(deps.storage))
    .register(createProfilesFeature(deps.storage))
    .register(
      createPortabilityFeature({
        storage: deps.storage,
        onRequestPopupImport: deps.onRequestPopupImport,
      })
    );
  return registry;
}

/**
 * Registers only feature modules that provide background message handlers so esbuild
 * tree-shakes UI-only modules (such as JSON import/export UI) out of the background worker.
 */
export function createBackgroundFeatureRegistry(storage: StorageRepository): FeatureRegistry {
  const registry = new FeatureRegistry();
  registry.register(createProfilesFeature(storage));
  return registry;
}
