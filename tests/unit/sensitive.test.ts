import { describe, expect, it } from 'vitest';
import { classifyFieldForRecording } from '../../src/core/sensitive';

const baseMeta = {
  type: 'text',
  id: 'firstName',
  name: 'first_name',
  autocomplete: '',
  ariaLabel: 'First Name',
};

describe('sensitive field classification', () => {
  it('allows normal form fields', () => {
    expect(
      classifyFieldForRecording(baseMeta, { skipPasswords: true, skipSensitiveFields: true })
    ).toBe('record');
  });

  it('always excludes non-data input types', () => {
    for (const type of ['hidden', 'submit', 'button', 'reset', 'file', 'image']) {
      expect(
        classifyFieldForRecording(
          { ...baseMeta, type },
          { skipPasswords: false, skipSensitiveFields: false }
        )
      ).toBe('skip-excluded');
    }
  });

  it('always excludes CAPTCHA and CSRF tokens regardless of settings', () => {
    for (const name of [
      'g-recaptcha-response',
      'h-captcha-response',
      'cf-turnstile-response',
      'captcha_code',
      'csrf_token',
      'authenticity_token',
      '_token',
    ]) {
      expect(
        classifyFieldForRecording(
          { ...baseMeta, name },
          { skipPasswords: false, skipSensitiveFields: false }
        )
      ).toBe('skip-excluded');
    }
  });

  it('skips password fields by default and allows them when opted in', () => {
    const pw = { ...baseMeta, type: 'password', name: 'password' };
    expect(classifyFieldForRecording(pw, { skipPasswords: true, skipSensitiveFields: true })).toBe(
      'skip-sensitive'
    );
    expect(classifyFieldForRecording(pw, { skipPasswords: false, skipSensitiveFields: true })).toBe(
      'record'
    );
  });

  it('skips CVV, card number, and OTP fields by default', () => {
    expect(
      classifyFieldForRecording(
        { ...baseMeta, autocomplete: 'cc-csc', name: 'sec' },
        { skipPasswords: true, skipSensitiveFields: true }
      )
    ).toBe('skip-sensitive');

    expect(
      classifyFieldForRecording(
        { ...baseMeta, name: 'otp_code' },
        { skipPasswords: true, skipSensitiveFields: true }
      )
    ).toBe('skip-sensitive');

    expect(
      classifyFieldForRecording(
        { ...baseMeta, name: 'otp_code' },
        { skipPasswords: true, skipSensitiveFields: false }
      )
    ).toBe('record');
  });
});
