import type { RecordOptions } from './types';

const EXCLUDED_INPUT_TYPES: ReadonlySet<string> = new Set([
  'button',
  'submit',
  'reset',
  'hidden',
  'file',
  'image',
]);

/** Patterns for anti-bot & CSRF tokens that should NEVER be recorded or replayed. */
const ALWAYS_BLOCKED_PATTERNS: readonly RegExp[] = [
  /captcha/i,
  /turnstile/i,
  /g-recaptcha/i,
  /h-captcha/i,
  /csrf/i,
  /xsrf/i,
  /authenticity[_-]?token/i,
  /__requestverificationtoken/i,
  /^_token$/i,
];

/** Patterns for payment CVV, card numbers, and one-time codes (skipped by default). */
const SENSITIVE_NAME_PATTERNS: readonly RegExp[] = [
  /(?:^|[\s_-])cvv2?(?:$|[\s_-])/i,
  /(?:^|[\s_-])cvc(?:$|[\s_-])/i,
  /security[_-]?code/i,
  /card[_-]?number/i,
  /(?:^|[\s_-])cc[_-]?num/i,
  /(?:^|[\s_-])otp(?:$|[\s_-])/i,
  /one[_-]?time[_-]?(code|pass)/i,
  /(?:^|[\s_-])2fa(?:$|[\s_-])/i,
  /(?:^|[\s_-])totp(?:$|[\s_-])/i,
  /(?:^|[\s_-])ssn(?:$|[\s_-])/i,
];

const SENSITIVE_AUTOCOMPLETE_TOKENS: ReadonlySet<string> = new Set([
  'cc-number',
  'cc-csc',
  'cc-exp',
  'cc-exp-month',
  'cc-exp-year',
  'one-time-code',
]);

export interface FieldSecurityMetadata {
  type: string;
  id: string;
  name: string;
  autocomplete: string;
  ariaLabel: string;
}

export type FieldRecordDecision = 'record' | 'skip-excluded' | 'skip-sensitive';

function isExcludedInputType(type: string): boolean {
  return EXCLUDED_INPUT_TYPES.has(type.toLowerCase());
}

function isAlwaysBlockedField(meta: FieldSecurityMetadata): boolean {
  const candidates = [meta.id.trim(), meta.name.trim()].filter(Boolean);
  return candidates.some((text) => ALWAYS_BLOCKED_PATTERNS.some((pattern) => pattern.test(text)));
}

export function isPasswordField(meta: FieldSecurityMetadata): boolean {
  if (meta.type.toLowerCase() === 'password') {
    return true;
  }
  const ac = meta.autocomplete.toLowerCase();
  return ac.includes('current-password') || ac.includes('new-password');
}

function isSensitiveNonPasswordField(meta: FieldSecurityMetadata): boolean {
  const acTokens = meta.autocomplete.toLowerCase().split(/\s+/).filter(Boolean);
  if (acTokens.some((token) => SENSITIVE_AUTOCOMPLETE_TOKENS.has(token))) {
    return true;
  }
  const candidates = [meta.id.trim(), meta.name.trim(), meta.ariaLabel.trim()].filter(Boolean);
  return candidates.some((text) => SENSITIVE_NAME_PATTERNS.some((pattern) => pattern.test(text)));
}

/**
 * Determines whether a DOM form control should be recorded or skipped based on
 * non-overridable safety rules (non-data inputs, CAPTCHAs, CSRF tokens) and user settings.
 */
export function classifyFieldForRecording(
  meta: FieldSecurityMetadata,
  options: Pick<RecordOptions, 'skipPasswords' | 'skipSensitiveFields'>
): FieldRecordDecision {
  if (isExcludedInputType(meta.type) || isAlwaysBlockedField(meta)) {
    return 'skip-excluded';
  }
  if (options.skipPasswords && isPasswordField(meta)) {
    return 'skip-sensitive';
  }
  if (options.skipSensitiveFields && isSensitiveNonPasswordField(meta)) {
    return 'skip-sensitive';
  }
  return 'record';
}
