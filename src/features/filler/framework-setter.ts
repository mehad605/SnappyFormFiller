import { HIGHLIGHT_DURATION_MS } from '../../core/constants';
import type { FormControlElement } from '../../core/dom-controls';
import type { FillOptions, FillResult, RecordedField } from '../../core/types';
import { indexPageControls, matchControl } from './dom-matcher';

interface ReactValueTracker {
  setValue(value: string): void;
}

type ReactTrackedElement = HTMLElement & {
  _valueTracker?: ReactValueTracker;
};

interface CachedSetters {
  inputValue: ((this: HTMLInputElement, v: string) => void) | undefined;
  inputChecked: ((this: HTMLInputElement, v: boolean) => void) | undefined;
  textareaValue: ((this: HTMLTextAreaElement, v: string) => void) | undefined;
  selectValue: ((this: HTMLSelectElement, v: string) => void) | undefined;
}

function getNativeSetters(): CachedSetters {
  return {
    inputValue: Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set,
    inputChecked: Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'checked')?.set,
    textareaValue: Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set,
    selectValue: Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set,
  };
}

function notifyReactTracker(el: HTMLElement, previousValue: string): void {
  const tracker = (el as ReactTrackedElement)._valueTracker;
  if (tracker && typeof tracker.setValue === 'function') {
    tracker.setValue(previousValue);
  }
}

function dispatchFormEvents(el: HTMLElement, includeInput: boolean): void {
  if (includeInput) {
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }
  el.dispatchEvent(new Event('change', { bubbles: true }));
  el.dispatchEvent(new Event('blur', { bubbles: true }));
}

function brieflyHighlight(el: HTMLElement): void {
  const prevOutline = el.style.outline;
  const prevOffset = el.style.outlineOffset;
  const prevTransition = el.style.transition;

  el.style.transition = 'outline-color 200ms ease';
  el.style.outline = '2px solid #059669';
  el.style.outlineOffset = '1px';

  globalThis.setTimeout(() => {
    el.style.outline = prevOutline;
    el.style.outlineOffset = prevOffset;
    el.style.transition = prevTransition;
  }, HIGHLIGHT_DURATION_MS);
}

function applyFieldValue(
  el: FormControlElement,
  field: RecordedField,
  setters: CachedSetters
): boolean {
  if (el instanceof HTMLInputElement && (el.type === 'checkbox' || el.type === 'radio')) {
    const desired = Boolean(field.checked);
    if (el.checked === desired) return false;

    const prevChecked = String(el.checked);
    if (setters.inputChecked) {
      setters.inputChecked.call(el, desired);
    } else {
      el.checked = desired;
    }
    notifyReactTracker(el, prevChecked);
    dispatchFormEvents(el, true);
    return true;
  }

  if (el instanceof HTMLSelectElement && el.multiple) {
    const desired = new Set(Array.isArray(field.value) ? field.value : [field.value]);
    let changed = false;
    for (const option of Array.from(el.options)) {
      const shouldSelect = desired.has(option.value);
      if (option.selected !== shouldSelect) {
        option.selected = shouldSelect;
        changed = true;
      }
    }
    if (!changed) return false;
    dispatchFormEvents(el, true);
    return true;
  }

  const nextValue = Array.isArray(field.value) ? (field.value[0] ?? '') : field.value;
  if (el.value === nextValue) return false;

  const prevValue = el.value;
  if (el instanceof HTMLInputElement && setters.inputValue) {
    setters.inputValue.call(el, nextValue);
  } else if (el instanceof HTMLTextAreaElement && setters.textareaValue) {
    setters.textareaValue.call(el, nextValue);
  } else if (el instanceof HTMLSelectElement && setters.selectValue) {
    setters.selectValue.call(el, nextValue);
  } else {
    el.value = nextValue;
  }

  notifyReactTracker(el, prevValue);
  dispatchFormEvents(el, true);
  return true;
}

/**
 * Fills recorded fields into the active document using native property setters and synthetic
 * event dispatch compatible with React, Vue, Angular, Svelte, and vanilla HTML.
 */
export function fillFormFields(doc: Document, options: FillOptions): FillResult {
  const candidates = indexPageControls(doc);
  const used = new Set<FormControlElement>();
  const setters = getNativeSetters();

  let filledCount = 0;
  let unchangedCount = 0;
  let skippedDisabledCount = 0;
  const unmatchedLabels: string[] = [];

  for (const field of options.fields) {
    const matched = matchControl(field, candidates, used);
    if (!matched) {
      unmatchedLabels.push(field.label || field.locator.id || field.locator.name || field.type);
      continue;
    }

    used.add(matched.el);

    const isReadOnly = 'readOnly' in matched.el && Boolean(matched.el.readOnly);
    if (matched.el.disabled || isReadOnly) {
      skippedDisabledCount += 1;
      continue;
    }

    const changed = applyFieldValue(matched.el, field, setters);
    if (changed) {
      filledCount += 1;
      if (options.highlightFilled) {
        brieflyHighlight(matched.el);
      }
    } else {
      unchangedCount += 1;
    }
  }

  return {
    filledCount,
    unchangedCount,
    skippedDisabledCount,
    unmatchedLabels,
  };
}
