import { FORBIDDEN_OBJECT_KEYS } from './constants';

const SUPPORTED_PROTOCOLS: ReadonlySet<string> = new Set(['http:', 'https:']);

/**
 * Parses a tab URL or imported origin string into a normalized http(s) origin.
 * Returns null for restricted browser pages (chrome://, about:, edge://, moz-extension://),
 * opaque origins ("null"), or malformed strings.
 */
export function parseSupportedOrigin(rawUrl: string | null | undefined): string | null {
  if (!rawUrl || typeof rawUrl !== 'string') {
    return null;
  }
  try {
    const parsed = new URL(rawUrl);
    if (!SUPPORTED_PROTOCOLS.has(parsed.protocol)) {
      return null;
    }
    const origin = parsed.origin;
    if (!origin || origin === 'null' || FORBIDDEN_OBJECT_KEYS.has(origin)) {
      return null;
    }
    return origin;
  } catch {
    return null;
  }
}

/**
 * Returns a concise human-readable reason why a URL cannot be recorded or filled.
 */
export function describeUnsupportedUrl(rawUrl: string | null | undefined): string {
  if (!rawUrl) {
    return 'No active web page detected';
  }
  try {
    const { protocol } = new URL(rawUrl);
    if (
      protocol === 'chrome:' ||
      protocol === 'edge:' ||
      protocol === 'brave:' ||
      protocol === 'about:' ||
      protocol === 'chrome-extension:' ||
      protocol === 'moz-extension:'
    ) {
      return `Browser internal pages (${protocol}//) cannot be accessed`;
    }
    if (protocol === 'file:') {
      return 'Local file:// pages are not enabled for security';
    }
    return `Unsupported page protocol (${protocol})`;
  } catch {
    return 'Cannot read this page';
  }
}
