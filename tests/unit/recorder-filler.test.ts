import { afterEach, describe, expect, it, vi } from 'vitest';
import { fillFormFields } from '../../src/features/filler/framework-setter';
import { aggregateFrameFillResults } from '../../src/features/filler/service';
import { collectFormFields } from '../../src/features/recorder/dom-collector';

const defaultRecordOpts = {
  skipPasswords: true,
  skipSensitiveFields: true,
  skipEmptyOnRecord: false,
};

afterEach(() => {
  document.body.replaceChildren();
  vi.useRealTimers();
});

describe('recorder and framework-aware filler end-to-end DOM', () => {
  it('records and replays text, textarea, select-one, select-multiple, checkbox, and radio', () => {
    document.body.innerHTML = `
      <form>
        <label for="fullName">Full Name</label>
        <input id="fullName" name="fullName" type="text" value="Ada Lovelace" />
        <textarea id="bio" name="bio">Pioneer of computing</textarea>
        <select id="country" name="country">
          <option value="us">US</option>
          <option value="uk" selected>UK</option>
        </select>
        <select id="skills" name="skills" multiple>
          <option value="ts" selected>TS</option>
          <option value="rust">Rust</option>
          <option value="go" selected>Go</option>
        </select>
        <input id="terms" name="terms" type="checkbox" value="accepted" checked />
        <input name="plan" type="radio" value="free" />
        <input name="plan" type="radio" value="pro" checked />
      </form>
    `;

    const recorded = collectFormFields(document, defaultRecordOpts);
    expect(recorded.fields).toHaveLength(7);
    expect(recorded.fields.find((f) => f.locator.id === 'skills')?.value).toEqual(['ts', 'go']);

    // Reset all form values
    (document.getElementById('fullName') as HTMLInputElement).value = '';
    (document.getElementById('bio') as HTMLTextAreaElement).value = '';
    (document.getElementById('country') as HTMLSelectElement).value = 'us';
    const skills = document.getElementById('skills') as HTMLSelectElement;
    Array.from(skills.options).forEach((o) => {
      o.selected = false;
    });
    (document.getElementById('terms') as HTMLInputElement).checked = false;
    document.querySelectorAll<HTMLInputElement>('input[name="plan"]').forEach((r) => {
      r.checked = r.value === 'free';
    });

    const events: string[] = [];
    document.getElementById('fullName')!.addEventListener('input', () => events.push('input'));
    document.getElementById('fullName')!.addEventListener('change', () => events.push('change'));
    document.getElementById('fullName')!.addEventListener('blur', () => events.push('blur'));

    const fillResult = fillFormFields(document, {
      fields: recorded.fields,
      highlightFilled: false,
    });

    expect(fillResult.unmatchedLabels).toEqual([]);
    expect(fillResult.filledCount).toBe(7);
    expect((document.getElementById('fullName') as HTMLInputElement).value).toBe('Ada Lovelace');
    expect((document.getElementById('bio') as HTMLTextAreaElement).value).toBe(
      'Pioneer of computing'
    );
    expect((document.getElementById('country') as HTMLSelectElement).value).toBe('uk');
    expect(Array.from(skills.selectedOptions).map((o) => o.value)).toEqual(['ts', 'go']);
    expect((document.getElementById('terms') as HTMLInputElement).checked).toBe(true);
    expect(
      (document.querySelector('input[name="plan"][value="pro"]') as HTMLInputElement).checked
    ).toBe(true);
    expect(events).toEqual(['input', 'change', 'blur']);
  });

  it('handles unmatched fields gracefully without crashing (v2.0 fieldLabel regression)', () => {
    document.body.innerHTML = `<input id="present" type="text" value="" />`;
    const result = fillFormFields(document, {
      highlightFilled: false,
      fields: [
        { label: 'Missing One', type: 'text', value: 'x', locator: { id: 'does-not-exist' } },
        { label: 'Present Field', type: 'text', value: 'ok', locator: { id: 'present' } },
      ],
    });

    expect(result.unmatchedLabels).toEqual(['Missing One']);
    expect(result.filledCount).toBe(1);
    expect((document.getElementById('present') as HTMLInputElement).value).toBe('ok');
  });

  it('matches duplicate-named inputs and dynamic-ID SPA inputs via testId/aria-label/label', () => {
    document.body.innerHTML = `
      <form>
        <input id=":r1:" data-testid="company-input" type="text" value="Acme Corp" />
        <input id="mui-42" aria-label="Phone Number" type="tel" value="555-0199" />
        <input name="tag[]" type="text" value="alpha" />
        <input name="tag[]" type="text" value="beta" />
      </form>
    `;

    const recorded = collectFormFields(document, defaultRecordOpts);
    // Ephemeral React/MUI IDs should not be stored as primary IDs
    expect(recorded.fields[0]?.locator.id).toBeUndefined();
    expect(recorded.fields[0]?.locator.testId).toBe('company-input');

    // Simulate reload with brand-new ephemeral IDs
    document.body.innerHTML = `
      <form>
        <input id=":r99:" data-testid="company-input" type="text" value="" />
        <input id="mui-999" aria-label="Phone Number" type="tel" value="" />
        <input name="tag[]" type="text" value="" />
        <input name="tag[]" type="text" value="" />
      </form>
    `;

    const result = fillFormFields(document, { fields: recorded.fields, highlightFilled: false });
    expect(result.unmatchedLabels).toEqual([]);
    expect(result.filledCount).toBe(4);
    expect(
      (document.querySelector('[data-testid="company-input"]') as HTMLInputElement).value
    ).toBe('Acme Corp');
    const tags = Array.from(document.querySelectorAll<HTMLInputElement>('input[name="tag[]"]')).map(
      (i) => i.value
    );
    expect(tags).toEqual(['alpha', 'beta']);
  });

  it('records and fills inputs inside open Shadow DOM', () => {
    const host = document.createElement('div');
    const shadow = host.attachShadow({ mode: 'open' });
    const input = document.createElement('input');
    input.name = 'shadow_email';
    input.type = 'email';
    input.value = 'shadow@example.com';
    shadow.appendChild(input);
    document.body.appendChild(host);

    const recorded = collectFormFields(document, defaultRecordOpts);
    expect(recorded.fields).toHaveLength(1);
    expect(recorded.fields[0]?.locator.inShadowDom).toBe(true);

    input.value = '';
    const res = fillFormFields(document, { fields: recorded.fields, highlightFilled: false });
    expect(res.filledCount).toBe(1);
    expect(input.value).toBe('shadow@example.com');
  });

  it('skips passwords, CAPTCHA, and CSRF by default; notifies React _valueTracker; restores highlight', () => {
    vi.useFakeTimers();
    document.body.innerHTML = `
      <form>
        <input id="user" name="user" type="text" value="alice" />
        <input id="pass" name="pass" type="password" value="s3cr3t" />
        <input id="g-recaptcha-response" name="g-recaptcha-response" type="text" value="tok" />
        <input id="csrf_token" name="csrf_token" type="text" value="abc" />
        <input id="locked" name="locked" type="text" value="fixed" readonly />
      </form>
    `;

    const recorded = collectFormFields(document, defaultRecordOpts);
    expect(recorded.skippedSensitive).toBe(1);
    expect(recorded.fields.map((f) => f.locator.id)).toEqual(['user', 'locked']);

    const userEl = document.getElementById('user') as HTMLInputElement & {
      _valueTracker?: { setValue: (v: string) => void };
    };
    userEl.value = '';
    userEl.style.outline = '1px dashed gray';
    const initialOutline = userEl.style.outline;
    const setTracker = vi.fn();
    userEl._valueTracker = { setValue: setTracker };

    const result = fillFormFields(document, { fields: recorded.fields, highlightFilled: true });
    expect(result.filledCount).toBe(1);
    expect(result.skippedDisabledCount).toBe(1);
    expect(setTracker).toHaveBeenCalledWith('');
    expect(userEl.style.outline).toContain('solid');

    vi.advanceTimersByTime(1000);
    expect(userEl.style.outline).toBe(initialOutline);
  });

  it('records and fills closed Shadow DOM inputs via custom ShadowRootResolver', () => {
    const host = document.createElement('div');
    const closedShadow = host.attachShadow({ mode: 'closed' });
    const input = document.createElement('input');
    input.name = 'closed_shadow_city';
    input.value = 'Edinburgh';
    closedShadow.appendChild(input);
    document.body.appendChild(host);

    // Standard el.shadowRoot is null for closed shadow roots
    expect(host.shadowRoot).toBeNull();

    const resolver = (el: Element) => (el === host ? closedShadow : el.shadowRoot);
    const recorded = collectFormFields(document, defaultRecordOpts, resolver);
    expect(recorded.fields).toHaveLength(1);
    expect(recorded.fields[0]?.locator.inShadowDom).toBe(true);
    expect(recorded.fields[0]?.value).toBe('Edinburgh');

    input.value = '';
    const res = fillFormFields(
      document,
      { fields: recorded.fields, highlightFilled: false },
      resolver
    );
    expect(res.filledCount).toBe(1);
    expect(input.value).toBe('Edinburgh');
  });

  it('scopes subframe fields by frameOrigin/framePath and aggregates multi-frame fills accurately', () => {
    // Main frame DOM
    document.body.innerHTML = `<input id="top_name" name="top_name" value="Top Value" />`;
    const topRecorded = collectFormFields(document, defaultRecordOpts, undefined, {
      isSubframe: false,
      origin: 'https://app.example',
      pathname: '/checkout',
    });

    // Subframe DOM (simulated separate document)
    const subDoc = document.implementation.createHTMLDocument('sub');
    subDoc.body.innerHTML = `<input id="frame_note" name="frame_note" value="Inside Iframe" />`;
    const subRecorded = collectFormFields(subDoc, defaultRecordOpts, undefined, {
      isSubframe: true,
      origin: 'https://app.example',
      pathname: '/embed-form',
    });

    expect(subRecorded.fields[0]?.locator.frameOrigin).toBe('https://app.example');
    expect(subRecorded.fields[0]?.locator.framePath).toBe('/embed-form');

    const combinedFields = [
      ...topRecorded.fields,
      ...subRecorded.fields,
      {
        label: 'Missing Frame Field',
        type: 'text',
        value: 'x',
        locator: { id: 'gone', frameOrigin: 'https://other.example', framePath: '/x' },
      },
    ];

    (document.getElementById('top_name') as HTMLInputElement).value = '';
    (subDoc.getElementById('frame_note') as HTMLInputElement).value = '';

    const topFill = fillFormFields(
      document,
      { fields: combinedFields, highlightFilled: false },
      undefined,
      { isSubframe: false, origin: 'https://app.example', pathname: '/checkout' }
    );
    const subFill = fillFormFields(
      subDoc,
      { fields: combinedFields, highlightFilled: false },
      undefined,
      { isSubframe: true, origin: 'https://app.example', pathname: '/embed-form' }
    );

    const aggregated = aggregateFrameFillResults(combinedFields, [topFill, subFill]);
    expect(aggregated.filledCount).toBe(2);
    expect(aggregated.unmatchedLabels).toEqual(['Missing Frame Field']);
    expect((document.getElementById('top_name') as HTMLInputElement).value).toBe('Top Value');
    expect((subDoc.getElementById('frame_note') as HTMLInputElement).value).toBe('Inside Iframe');
  });
});
