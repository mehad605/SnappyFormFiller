import {
  buildCssPath,
  collectControls,
  getAssociatedLabelText,
  getTestId,
  isDynamicId,
  type FormControlElement,
  type ShadowRootResolver,
} from '../../core/dom-controls';
import { classifyFieldForRecording, isPasswordField } from '../../core/sensitive';
import type { FieldLocator, RecordedField, RecordOptions, RecordResult } from '../../core/types';

export interface FrameContextMeta {
  isSubframe: boolean;
  origin: string;
  pathname: string;
}

function deriveDisplayLabel(locator: FieldLocator, fallbackType: string): string {
  return (
    locator.labelText ||
    locator.ariaLabel ||
    locator.name ||
    locator.id ||
    locator.testId ||
    locator.placeholder ||
    fallbackType
  ).slice(0, 80);
}

function readControlValue(el: FormControlElement): { value: string | string[]; checked?: boolean } {
  if (el instanceof HTMLSelectElement && el.multiple) {
    return { value: Array.from(el.selectedOptions).map((opt) => opt.value) };
  }
  if (el instanceof HTMLInputElement && (el.type === 'checkbox' || el.type === 'radio')) {
    return { value: el.value, checked: el.checked };
  }
  return { value: el.value };
}

function isEmptyControlValue(type: string, value: string | string[], checked?: boolean): boolean {
  if (type === 'checkbox' || type === 'radio') {
    return !checked;
  }
  if (Array.isArray(value)) {
    return value.length === 0;
  }
  return value === '';
}

/**
 * Collects all recordable form fields from a document (including open & closed Shadow DOM).
 */
export function collectFormFields(
  doc: Document,
  options: RecordOptions,
  resolveShadowRoot: ShadowRootResolver = (el) => el.shadowRoot,
  frameMeta?: FrameContextMeta
): RecordResult {
  const controls = collectControls(doc, false, [], resolveShadowRoot);
  const fields: RecordedField[] = [];
  let skippedSensitive = 0;
  let skippedEmpty = 0;

  const nameCounts = new Map<string, number>();

  for (const { el, inShadowDom } of controls) {
    if (el.disabled) continue;

    const type = (el.type || el.tagName.toLowerCase()).toLowerCase();
    const id = el.id?.trim() ?? '';
    const name = el.getAttribute('name')?.trim() ?? '';
    const ariaLabel = el.getAttribute('aria-label')?.trim() ?? '';
    const autocomplete = el.getAttribute('autocomplete')?.trim() ?? '';

    const decision = classifyFieldForRecording(
      { type, id, name, autocomplete, ariaLabel },
      options
    );
    if (decision === 'skip-excluded') continue;
    if (decision === 'skip-sensitive') {
      skippedSensitive += 1;
      continue;
    }

    const { value, checked } = readControlValue(el);
    if (options.skipEmptyOnRecord && isEmptyControlValue(type, value, checked)) {
      skippedEmpty += 1;
      continue;
    }

    const labelText = getAssociatedLabelText(el, doc);
    const testId = getTestId(el);
    const placeholder = el.getAttribute('placeholder')?.trim() ?? '';
    const cssPath = buildCssPath(el);

    let index: number | undefined;
    if (name && type !== 'radio' && type !== 'checkbox') {
      const count = nameCounts.get(name) ?? 0;
      index = count;
      nameCounts.set(name, count + 1);
    }

    const locator: FieldLocator = {
      ...(id && !isDynamicId(id) ? { id } : {}),
      ...(name ? { name } : {}),
      ...(testId ? { testId } : {}),
      ...(ariaLabel ? { ariaLabel } : {}),
      ...(labelText ? { labelText } : {}),
      ...(placeholder ? { placeholder } : {}),
      ...(cssPath ? { cssPath } : {}),
      ...(typeof index === 'number' ? { index } : {}),
      ...(inShadowDom ? { inShadowDom: true } : {}),
      ...(frameMeta?.isSubframe
        ? { frameOrigin: frameMeta.origin, framePath: frameMeta.pathname }
        : {}),
    };

    const sensitive = isPasswordField({ type, id, name, autocomplete, ariaLabel });

    fields.push({
      label: deriveDisplayLabel(locator, type),
      type,
      value,
      ...(typeof checked === 'boolean' ? { checked } : {}),
      ...(sensitive ? { sensitive: true } : {}),
      locator,
    });
  }

  return { fields, skippedSensitive, skippedEmpty };
}
