import type { RecordedField } from '../../core/types';
import { clearChildren, createEl } from './dom';

export interface FieldEditorCallbacks {
  onChange(index: number, updated: RecordedField): void;
  onDelete(index: number): void;
}

/**
 * Renders an accessible, inline-editable list of RecordedFields.
 * Replaces v2.0's buggy contentEditable divs with real <input> and checkbox toggle controls.
 */
export function renderFieldEditorList(
  container: HTMLElement,
  fields: readonly RecordedField[],
  callbacks: FieldEditorCallbacks
): void {
  clearChildren(container);

  if (fields.length === 0) {
    container.append(
      createEl('p', {
        className: 'empty-msg',
        text: 'No fields saved for this profile. Click Record on a page with a form.',
      })
    );
    return;
  }

  const list = createEl('ul', { className: 'field-items', role: 'list' });

  fields.forEach((field, index) => {
    const row = createEl('li', { className: 'field-row' });

    const metaParts: string[] = [];
    if (field.locator.id) metaParts.push(`#${field.locator.id}`);
    if (field.locator.name) metaParts.push(`name="${field.locator.name}"`);
    if (field.locator.inShadowDom) metaParts.push('Shadow DOM');

    const labelEl = createEl('span', {
      className: 'field-label',
      text: field.label,
      title: metaParts.length > 0 ? `${field.label} (${metaParts.join(', ')})` : field.label,
    });

    const controlWrap = createEl('div', { className: 'field-control' });

    if (field.type === 'checkbox' || field.type === 'radio') {
      const toggle = createEl('input', {
        type: 'checkbox',
        className: 'field-toggle',
        checked: Boolean(field.checked),
        ariaLabel: `Toggle ${field.label}`,
      });
      const toggleText = createEl('span', {
        className: 'field-toggle-text',
        text: field.checked
          ? `Checked (${String(field.value)})`
          : `Unchecked (${String(field.value)})`,
      });
      toggle.addEventListener('change', () => {
        const next: RecordedField = { ...field, checked: toggle.checked };
        toggleText.textContent = next.checked
          ? `Checked (${String(next.value)})`
          : `Unchecked (${String(next.value)})`;
        callbacks.onChange(index, next);
      });
      controlWrap.append(toggle, toggleText);
    } else {
      const isMulti = Array.isArray(field.value);
      const initialText = isMulti ? (field.value as string[]).join(', ') : (field.value as string);
      const input = createEl('input', {
        type: field.sensitive ? 'password' : 'text',
        className: 'field-input',
        value: initialText,
        ariaLabel: `Value for ${field.label}`,
        placeholder: isMulti ? 'comma-separated values' : '(empty)',
      });

      const commitIfChanged = () => {
        const currentStr = input.value;
        if (currentStr === initialText) return;
        const nextValue = isMulti
          ? currentStr
              .split(',')
              .map((s) => s.trim())
              .filter(Boolean)
          : currentStr;
        callbacks.onChange(index, { ...field, value: nextValue });
      };

      input.addEventListener('blur', commitIfChanged);
      input.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter') {
          input.blur();
        } else if (ev.key === 'Escape') {
          input.value = initialText;
          input.blur();
        }
      });

      controlWrap.append(input);

      if (field.sensitive) {
        const revealBtn = createEl('button', {
          type: 'button',
          className: 'icon-btn',
          text: 'Show',
          ariaLabel: `Reveal password value for ${field.label}`,
        });
        revealBtn.addEventListener('click', () => {
          const showing = input.type === 'text';
          input.type = showing ? 'password' : 'text';
          revealBtn.textContent = showing ? 'Show' : 'Hide';
        });
        controlWrap.append(revealBtn);
      }
    }

    const typeBadge = createEl('span', {
      className: 'field-type',
      text:
        field.type === 'select-multiple'
          ? 'multi'
          : field.type === 'select-one'
            ? 'select'
            : field.type,
    });

    const delBtn = createEl('button', {
      type: 'button',
      className: 'field-del',
      text: '×',
      ariaLabel: `Delete field ${field.label}`,
      title: `Delete ${field.label}`,
    });
    delBtn.addEventListener('click', () => callbacks.onDelete(index));

    row.append(labelEl, controlWrap, typeBadge, delBtn);
    list.append(row);
  });

  container.append(list);
}

/**
 * Renders a non-blocking inline confirmation dialog (never uses window.confirm()).
 */
export function showInlineConfirm(
  host: HTMLElement,
  options: { message: string; confirmLabel: string; variant?: 'danger' | 'primary' }
): Promise<boolean> {
  return new Promise((resolve) => {
    clearChildren(host);
    host.classList.remove('hidden');

    const cleanup = (answer: boolean) => {
      clearChildren(host);
      host.classList.add('hidden');
      resolve(answer);
    };

    const cancelBtn = createEl('button', {
      type: 'button',
      className: 'btn btn-neutral btn-sm',
      text: 'Cancel',
    });
    cancelBtn.addEventListener('click', () => cleanup(false));

    const confirmBtn = createEl('button', {
      type: 'button',
      className:
        options.variant === 'danger' ? 'btn btn-danger-solid btn-sm' : 'btn btn-primary btn-sm',
      text: options.confirmLabel,
    });
    confirmBtn.addEventListener('click', () => cleanup(true));

    const bar = createEl('div', { className: 'confirm-bar', role: 'alertdialog' }, [
      createEl('p', { className: 'confirm-message', text: options.message }),
      createEl('div', { className: 'confirm-actions' }, [cancelBtn, confirmBtn]),
    ]);

    host.append(bar);
    cancelBtn.focus();
  });
}

/**
 * Renders a safe 3-way Import confirmation (Merge / Replace All / Cancel).
 * Fixes v2.0's critical bug where clicking Cancel wiped all saved data.
 */
export function showImportChoice(
  host: HTMLElement,
  summaryText: string
): Promise<'merge' | 'replace' | 'cancel'> {
  return new Promise((resolve) => {
    clearChildren(host);
    host.classList.remove('hidden');

    const cleanup = (choice: 'merge' | 'replace' | 'cancel') => {
      clearChildren(host);
      host.classList.add('hidden');
      resolve(choice);
    };

    const cancelBtn = createEl('button', {
      type: 'button',
      className: 'btn btn-neutral btn-sm',
      text: 'Cancel',
    });
    cancelBtn.addEventListener('click', () => cleanup('cancel'));

    const mergeBtn = createEl('button', {
      type: 'button',
      className: 'btn btn-primary btn-sm',
      text: 'Merge',
    });
    mergeBtn.addEventListener('click', () => cleanup('merge'));

    const replaceBtn = createEl('button', {
      type: 'button',
      className: 'btn btn-danger-solid btn-sm',
      text: 'Replace All',
    });
    replaceBtn.addEventListener('click', () => cleanup('replace'));

    const bar = createEl('div', { className: 'confirm-bar', role: 'alertdialog' }, [
      createEl('p', { className: 'confirm-message', text: summaryText }),
      createEl('div', { className: 'confirm-actions' }, [cancelBtn, mergeBtn, replaceBtn]),
    ]);

    host.append(bar);
    mergeBtn.focus();
  });
}
