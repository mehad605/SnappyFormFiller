# ADR 006: Security, Privacy, and Sensitive-Field Handling

- **Status:** Accepted
- **Date:** 2026-11-26

## Context

The v2.0 audit uncovered four security/privacy weaknesses:

1. `recorder.js` silently captured `type="password"` inputs in plaintext into `storage.local` and exported them in unencrypted JSON.
2. `setStatus` interpolated untrusted strings (including JSON keys from imported files) into `innerHTML`.
3. JSON import lacked prototype-pollution guards, origin validation, schema validation, and file-size bounds.
4. Inline `<style>` blocked enforcing strict `style-src 'self'` CSP.

## Options Considered

### Password & Sensitive Field Handling

| Option                                             | Security                                                                   | Developer/QA Utility                                                                                                                  | Verdict    |
| -------------------------------------------------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| **Record everything (v2.0 behavior)**              | Poor — silent plaintext credential capture                                 | High                                                                                                                                  | Rejected   |
| **Hard-block passwords permanently**               | High                                                                       | Breaks QA engineers who explicitly test staging login forms with dummy passwords                                                      | Rejected   |
| **Safe-by-default skip + explicit opt-in setting** | High by default (passwords, CVV, OTP, CSRF, CAPTCHA skipped automatically) | Full utility when a QA user explicitly enables "Allow password fields" in Settings (values remain masked in UI and flagged on export) | **Chosen** |

## Decision

1. **Always excluded (non-overridable):**
   - Non-data input types: `button`, `submit`, `reset`, `hidden`, `file`, `image`.
   - CAPTCHA & anti-bot tokens: `captcha`, `recaptcha`, `hcaptcha`, `turnstile`, `g-recaptcha-response`, `h-captcha-response`, `cf-turnstile-response`.
   - CSRF / authenticity tokens: `csrf`, `xsrf`, `authenticity_token`, `__requestverificationtoken`, `_token`.
2. **Excluded by default (`skipPasswords: true`, `skipSensitiveFields: true`):**
   - Password fields (`type="password"`, `autocomplete` containing `password`).
   - Payment/OTP fields (`autocomplete` in `cc-number`, `cc-csc`, `cc-exp`, `one-time-code`, or names matching `cvv`, `cvc`, `cardnumber`, `otp`).
   - Users can explicitly toggle these in Settings if needed for local/staging test forms; password values are masked (`••••••••`) in the UI by default with an explicit reveal toggle.
3. **Zero `innerHTML` & Strict CSP:**
   - Every UI view uses external CSS (`style-src 'self'`) and `textContent`-only DOM construction.
4. **Hardened JSON Import Parser (`src/features/portability/serializer.ts`):**
   - Enforces a 5 MB file size limit before reading.
   - Rejects prototype-pollution keys (`__proto__`, `constructor`, `prototype`).
   - Validates every origin with `new URL(origin)` restricting protocols to `http:` and `https:` (and `file:` only if valid origin, actually strictly `http:`/`https:` normalized to `url.origin`).
   - Validates every field object's types and bounds; supports both v2.0 and v3.0 export formats cleanly.
   - Offers an explicit 3-way choice UI: **Merge**, **Replace All**, or **Cancel** (default safe action: Cancel).

## Trade-offs

- Existing v2.0 users who previously recorded password fields will no longer capture passwords automatically until they opt in via Settings. This trade-off is documented clearly in the UI status notice ("Skipped N sensitive field(s)") and in `README.md`.
