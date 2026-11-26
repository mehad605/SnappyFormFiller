import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const pkg = JSON.parse(readFileSync(resolve('package.json'), 'utf8'));

/**
 * Generates target-specific Manifest V3 JSON from a single source of truth.
 * Keeps permissions strictly minimal: activeTab, scripting, storage (zero host permissions).
 *
 * @param {'chromium' | 'firefox'} target
 */
export function buildManifest(target) {
  const base = {
    manifest_version: 3,
    name: 'Snappy Form Filler',
    version: pkg.version,
    description:
      'Record and replay form data across any website. Local-first per-site profiles with framework-aware filling.',
    permissions: ['activeTab', 'scripting', 'storage'],
    icons:
      target === 'firefox'
        ? {
            16: 'icons/icon-16.png',
            32: 'icons/icon-32.png',
            48: 'icons/icon-48.png',
            96: 'icons/icon-96.png',
            128: 'icons/icon-128.png',
          }
        : {
            16: 'icons/icon-16.png',
            32: 'icons/icon-32.png',
            48: 'icons/icon-48.png',
            128: 'icons/icon-128.png',
          },
    action: {
      default_title: 'Snappy Form Filler',
      default_popup: 'popup.html',
      default_icon: {
        16: 'icons/icon-16.png',
        32: 'icons/icon-32.png',
        48: 'icons/icon-48.png',
      },
    },
    options_ui: {
      page: 'options.html',
      open_in_tab: true,
    },
    commands: {
      _execute_action: {
        suggested_key: {
          default: 'Alt+Shift+S',
        },
        description: 'Open Snappy Form Filler',
      },
    },
    content_security_policy: {
      extension_pages: "script-src 'self'; object-src 'self'; style-src 'self'",
    },
  };

  if (target === 'chromium') {
    return {
      ...base,
      minimum_chrome_version: '109',
      background: {
        service_worker: 'background.js',
        type: 'module',
      },
    };
  }

  if (target === 'firefox') {
    return {
      ...base,
      background: {
        scripts: ['background.js'],
        type: 'module',
      },
      browser_specific_settings: {
        gecko: {
          id: 'snappy-form-filler@mehad605.github.io',
          strict_min_version: '109.0',
          data_collection_permissions: {
            required: ['none'],
          },
        },
        gecko_android: {
          strict_min_version: '120.0',
        },
      },
    };
  }

  throw new Error(`Unsupported build target: ${target}`);
}
