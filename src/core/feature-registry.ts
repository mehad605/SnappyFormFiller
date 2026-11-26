import type { FeatureModule, PopupActionDescriptor, PopupActionSlot } from './types';

/**
 * Central feature registry.
 * Adding a new feature requires creating one folder under `src/features/<name>/`
 * and registering it in `src/features/index.ts` — no edits to core UI or background routing.
 */
export class FeatureRegistry {
  private readonly modules = new Map<string, FeatureModule>();

  register(feature: FeatureModule): this {
    if (this.modules.has(feature.id)) {
      throw new Error(`Feature "${feature.id}" is already registered`);
    }
    this.modules.set(feature.id, feature);
    return this;
  }

  getPopupActions(slot?: PopupActionSlot): PopupActionDescriptor[] {
    const actions: PopupActionDescriptor[] = [];
    for (const feature of this.modules.values()) {
      if (!feature.popupActions) continue;
      for (const action of feature.popupActions) {
        if (!slot || action.slot === slot) {
          actions.push(action);
        }
      }
    }
    return actions.sort((a, b) => a.order - b.order);
  }

  getBackgroundHandlers(): Record<string, (payload: unknown) => Promise<unknown>> {
    const merged: Record<string, (payload: unknown) => Promise<unknown>> = {};
    for (const feature of this.modules.values()) {
      if (!feature.backgroundHandlers) continue;
      for (const [type, handler] of Object.entries(feature.backgroundHandlers)) {
        if (type in merged) {
          throw new Error(`Background message handler "${type}" registered twice`);
        }
        merged[type] = handler;
      }
    }
    return merged;
  }
}
