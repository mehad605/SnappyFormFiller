export type FormControlElement = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;

const CONTROL_SELECTOR = 'input, select, textarea';

/** Patterns for framework-generated ephemeral IDs (React useId, MUI, Radix, Ember). */
const DYNAMIC_ID_PATTERN =
  /^(:r[0-9a-z]+:|mui-\d+|radix-:r[0-9a-z]+:|ember\d+|headlessui-[a-z-]+-\d+)$/i;

export function isDynamicId(id: string): boolean {
  return DYNAMIC_ID_PATTERN.test(id.trim());
}

/**
 * Traverses a document and any open Shadow DOM roots in DOM order, collecting form controls.
 */
export function collectControls(
  root: Document | ShadowRoot,
  inShadowDom = false,
  acc: Array<{ el: FormControlElement; inShadowDom: boolean }> = []
): Array<{ el: FormControlElement; inShadowDom: boolean }> {
  const startNode: Element | ShadowRoot | null =
    root instanceof Document ? (root.body ?? root.documentElement) : root;
  if (!startNode) return acc;

  const visit = (container: Element | ShadowRoot, insideShadow: boolean) => {
    for (const child of Array.from(container.children)) {
      if (child.matches(CONTROL_SELECTOR)) {
        acc.push({ el: child as FormControlElement, inShadowDom: insideShadow });
      }
      if (child.shadowRoot) {
        visit(child.shadowRoot, true);
      }
      if (child.children.length > 0) {
        visit(child, insideShadow);
      }
    }
  };

  visit(startNode, inShadowDom);
  return acc;
}

export function getAssociatedLabelText(el: FormControlElement, doc: Document): string {
  const labelledBy = el.getAttribute('aria-labelledby');
  if (labelledBy) {
    const text = labelledBy
      .split(/\s+/)
      .map((id) => doc.getElementById(id)?.textContent?.trim() ?? '')
      .filter(Boolean)
      .join(' ');
    if (text) return text;
  }

  if (el.id) {
    try {
      const explicit = doc.querySelector(`label[for="${CSS.escape(el.id)}"]`);
      const text = explicit?.textContent?.trim();
      if (text) return text;
    } catch {
      // Ignore invalid selector edge cases in non-standard DOMs.
    }
  }

  const wrappingLabel = el.closest('label');
  if (wrappingLabel) {
    const clone = wrappingLabel.cloneNode(true) as HTMLElement;
    clone.querySelectorAll(CONTROL_SELECTOR).forEach((ctrl) => ctrl.remove());
    const text = clone.textContent?.trim();
    if (text) return text;
  }

  return '';
}

export function getTestId(el: Element): string {
  return (
    el.getAttribute('data-testid') ??
    el.getAttribute('data-test') ??
    el.getAttribute('data-cy') ??
    ''
  ).trim();
}

/**
 * Builds a concise, deterministic CSS path relative to the element's root node.
 */
export function buildCssPath(el: Element): string {
  const segments: string[] = [];
  let current: Element | null = el;
  let depth = 0;

  while (current && depth < 5) {
    const tag = current.tagName.toLowerCase();
    if (tag === 'body' || tag === 'html') break;

    if (current.id && !isDynamicId(current.id)) {
      segments.unshift(`#${CSS.escape(current.id)}`);
      break;
    }

    const parent: Element | null = current.parentElement;
    if (!parent) {
      segments.unshift(tag);
      break;
    }

    const siblings = Array.from(parent.children).filter((c) => c.tagName === current!.tagName);
    if (siblings.length > 1) {
      const idx = siblings.indexOf(current) + 1;
      segments.unshift(`${tag}:nth-of-type(${idx})`);
    } else {
      segments.unshift(tag);
    }

    current = parent;
    depth += 1;
  }

  return segments.join(' > ');
}
