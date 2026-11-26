/**
 * Returns an element's open OR closed ShadowRoot when running in an extension isolated world.
 * Uses `chrome.dom.openOrClosedShadowRoot` (Chromium 88+) or `el.openOrClosedShadowRoot`
 * (Firefox 63+), falling back safely to `el.shadowRoot` in standard DOM/test environments.
 * Zero extra manifest permissions are required.
 */
export function getOpenOrClosedShadowRoot(el: Element): ShadowRoot | null {
  if (el.shadowRoot) {
    return el.shadowRoot;
  }

  const fxEl = el as Element & { openOrClosedShadowRoot?: ShadowRoot | null };
  if (fxEl.openOrClosedShadowRoot) {
    return fxEl.openOrClosedShadowRoot;
  }

  const g = globalThis as unknown as {
    chrome?: {
      dom?: {
        openOrClosedShadowRoot?: (node: Element) => ShadowRoot | null;
      };
    };
  };

  try {
    return g.chrome?.dom?.openOrClosedShadowRoot?.(el) ?? null;
  } catch {
    return null;
  }
}
