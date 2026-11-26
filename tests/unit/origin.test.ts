import { describe, expect, it } from 'vitest';
import { describeUnsupportedUrl, parseSupportedOrigin } from '../../src/core/origin';

describe('origin utilities', () => {
  it('normalizes valid http and https URLs to origin', () => {
    expect(parseSupportedOrigin('https://example.com/forms/apply?step=2#top')).toBe(
      'https://example.com'
    );
    expect(parseSupportedOrigin('http://localhost:3000/login')).toBe('http://localhost:3000');
  });

  it('rejects browser internal, file, opaque, and malformed URLs', () => {
    expect(parseSupportedOrigin('chrome://extensions')).toBeNull();
    expect(parseSupportedOrigin('about:blank')).toBeNull();
    expect(parseSupportedOrigin('moz-extension://1234/popup.html')).toBeNull();
    expect(parseSupportedOrigin('file:///tmp/test.html')).toBeNull();
    expect(parseSupportedOrigin('javascript:alert(1)')).toBeNull();
    expect(parseSupportedOrigin('not-a-url')).toBeNull();
    expect(parseSupportedOrigin(null)).toBeNull();
    expect(parseSupportedOrigin(undefined)).toBeNull();
  });

  it('describes unsupported URLs clearly', () => {
    expect(describeUnsupportedUrl('chrome://settings')).toContain('Browser internal pages');
    expect(describeUnsupportedUrl('about:debugging')).toContain('Browser internal pages');
    expect(describeUnsupportedUrl('file:///home/user/form.html')).toContain('file://');
    expect(describeUnsupportedUrl(null)).toContain('No active web page');
  });
});
