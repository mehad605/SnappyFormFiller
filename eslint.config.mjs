import js from '@eslint/js';
import prettierConfig from 'eslint-config-prettier';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['dist/**', 'artifacts/**', 'node_modules/**', 'coverage/**'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  prettierConfig,
  {
    files: ['src/**/*.ts', 'tests/**/*.ts'],
    rules: {
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      'no-console': ['warn', { allow: ['warn', 'error'] }],
    },
  },
  {
    files: ['src/**/*.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: 'AssignmentExpression[left.property.name="innerHTML"]',
          message:
            'Do not assign to innerHTML. Use XSS-safe DOM helpers (textContent / createEl) instead.',
        },
        {
          selector: 'AssignmentExpression[left.property.name="outerHTML"]',
          message: 'Do not assign to outerHTML. Use XSS-safe DOM helpers instead.',
        },
        {
          selector: 'CallExpression[callee.property.name="insertAdjacentHTML"]',
          message: 'Do not call insertAdjacentHTML. Use XSS-safe DOM helpers instead.',
        },
      ],
    },
  },
  {
    // Enforce strict platform boundary: no feature, core, UI, or background code may touch chrome.* or browser.* directly.
    files: ['src/core/**/*.ts', 'src/features/**/*.ts', 'src/ui/**/*.ts', 'src/background/**/*.ts'],
    rules: {
      'no-restricted-globals': [
        'error',
        {
          name: 'chrome',
          message: 'Use BrowserAdapter from src/platform/browser.ts instead of chrome.* directly.',
        },
        {
          name: 'browser',
          message: 'Use BrowserAdapter from src/platform/browser.ts instead of browser.* directly.',
        },
      ],
    },
  },
  {
    files: ['scripts/**/*.mjs', 'tests/**/*.mjs'],
    languageOptions: {
      globals: {
        console: 'readonly',
        process: 'readonly',
        URL: 'readonly',
        performance: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        Buffer: 'readonly',
      },
    },
    rules: {
      'no-console': 'off',
    },
  },
  {
    files: ['tests/e2e/**/*.mjs'],
    languageOptions: {
      globals: {
        document: 'readonly',
        chrome: 'readonly',
      },
    },
  }
);
