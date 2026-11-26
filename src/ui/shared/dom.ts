/**
 * XSS-safe DOM construction helpers.
 * Strictly avoids innerHTML; all text content is assigned via textContent.
 */

export interface ElementAttrs {
  className?: string;
  id?: string;
  text?: string;
  title?: string;
  type?: string;
  value?: string;
  placeholder?: string;
  ariaLabel?: string;
  role?: string;
  disabled?: boolean;
  checked?: boolean;
  dataset?: Record<string, string>;
}

export function createEl<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs?: ElementAttrs,
  children?: Array<Node | string | null | undefined>
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);

  if (attrs) {
    if (attrs.className) el.className = attrs.className;
    if (attrs.id) el.id = attrs.id;
    if (attrs.text !== undefined) el.textContent = attrs.text;
    if (attrs.title !== undefined) el.title = attrs.title;
    if (attrs.ariaLabel) el.setAttribute('aria-label', attrs.ariaLabel);
    if (attrs.role) el.setAttribute('role', attrs.role);
    if (attrs.dataset) {
      for (const [k, v] of Object.entries(attrs.dataset)) {
        el.dataset[k] = v;
      }
    }
    if ('type' in el && attrs.type) {
      (el as HTMLInputElement | HTMLButtonElement).type = attrs.type;
    }
    if ('value' in el && attrs.value !== undefined) {
      (el as HTMLInputElement | HTMLSelectElement).value = attrs.value;
    }
    if ('placeholder' in el && attrs.placeholder !== undefined) {
      (el as HTMLInputElement).placeholder = attrs.placeholder;
    }
    if ('disabled' in el && attrs.disabled !== undefined) {
      (el as HTMLInputElement | HTMLButtonElement).disabled = attrs.disabled;
    }
    if ('checked' in el && attrs.checked !== undefined) {
      (el as HTMLInputElement).checked = attrs.checked;
    }
  }

  if (children) {
    for (const child of children) {
      if (child === null || child === undefined) continue;
      el.append(typeof child === 'string' ? document.createTextNode(child) : child);
    }
  }

  return el;
}

export function clearChildren(el: Element): void {
  el.replaceChildren();
}

export function getRequiredEl<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) {
    throw new Error(`Missing required DOM element "#${id}"`);
  }
  return el as T;
}
