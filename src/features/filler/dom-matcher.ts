import {
  buildCssPath,
  collectControls,
  getAssociatedLabelText,
  getTestId,
  type FormControlElement,
  type ShadowRootResolver,
} from '../../core/dom-controls';
import type { RecordedField } from '../../core/types';

export interface IndexedControl {
  el: FormControlElement;
  type: string;
  id: string;
  name: string;
  testId: string;
  ariaLabel: string;
  labelText: string;
  placeholder: string;
  cssPath: string;
  inShadowDom: boolean;
}

/**
 * Indexes all form controls in the document and open/closed Shadow DOM in a single pass.
 */
export function indexPageControls(
  doc: Document,
  resolveShadowRoot: ShadowRootResolver = (el) => el.shadowRoot
): IndexedControl[] {
  return collectControls(doc, false, [], resolveShadowRoot).map(({ el, inShadowDom }) => ({
    el,
    type: (el.type || el.tagName.toLowerCase()).toLowerCase(),
    id: el.id?.trim() ?? '',
    name: el.getAttribute('name')?.trim() ?? '',
    testId: getTestId(el),
    ariaLabel: el.getAttribute('aria-label')?.trim() ?? '',
    labelText: getAssociatedLabelText(el, doc),
    placeholder: el.getAttribute('placeholder')?.trim() ?? '',
    cssPath: buildCssPath(el),
    inShadowDom,
  }));
}

function isCheckable(type: string): boolean {
  return type === 'checkbox' || type === 'radio';
}

function isCompatibleControlType(recordedType: string, candidateType: string): boolean {
  if (recordedType === candidateType) return true;
  // Text-like inputs can evolve (e.g., text <-> email / tel / search / url)
  const textLike = new Set(['text', 'email', 'tel', 'search', 'url', 'number']);
  return textLike.has(recordedType) && textLike.has(candidateType);
}

/**
 * Resolves a RecordedField against pre-indexed page controls using prioritized fallback strategies:
 * 1. Exact id
 * 2. Name (+ value for radio/checkbox, or occurrence index for duplicate names)
 * 3. data-testid / data-test / data-cy
 * 4. aria-label or associated <label> text + compatible type
 * 5. placeholder + compatible type
 * 6. Deterministic CSS path
 */
export function matchControl(
  field: RecordedField,
  candidates: readonly IndexedControl[],
  used: ReadonlySet<FormControlElement>
): IndexedControl | null {
  const { locator, type } = field;
  const available = candidates.filter((c) => !used.has(c.el));

  // 1. Exact ID
  if (locator.id) {
    const byId = available.find((c) => c.id === locator.id);
    if (byId) return byId;
  }

  // 2. Name
  if (locator.name) {
    const byName = available.filter((c) => c.name === locator.name);
    if (byName.length > 0) {
      if (isCheckable(type)) {
        const expectedValue = Array.isArray(field.value) ? field.value[0] : field.value;
        const exact = byName.find((c) => c.el.value === expectedValue);
        if (exact) return exact;
        if (byName.length === 1) return byName[0]!;
      } else {
        if (typeof locator.index === 'number') {
          const allByName = candidates.filter((c) => c.name === locator.name);
          const indexed = allByName[locator.index];
          if (indexed && !used.has(indexed.el)) return indexed;
        }
        return byName[0]!;
      }
    }
  }

  // 3. Test ID
  if (locator.testId) {
    const byTestId = available.find((c) => c.testId === locator.testId);
    if (byTestId) return byTestId;
  }

  // 4. ARIA label or associated <label>
  if (locator.ariaLabel) {
    const byAria = available.find(
      (c) => c.ariaLabel === locator.ariaLabel && isCompatibleControlType(type, c.type)
    );
    if (byAria) return byAria;
  }
  if (locator.labelText) {
    const byLabel = available.find(
      (c) => c.labelText === locator.labelText && isCompatibleControlType(type, c.type)
    );
    if (byLabel) return byLabel;
  }

  // 5. Placeholder
  if (locator.placeholder) {
    const byPlaceholder = available.find(
      (c) => c.placeholder === locator.placeholder && isCompatibleControlType(type, c.type)
    );
    if (byPlaceholder) return byPlaceholder;
  }

  // 6. CSS Path fallback
  if (locator.cssPath) {
    const byCss = available.find(
      (c) => c.cssPath === locator.cssPath && isCompatibleControlType(type, c.type)
    );
    if (byCss) return byCss;
  }

  return null;
}
