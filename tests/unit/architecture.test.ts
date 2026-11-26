import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function listTsFiles(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      listTsFiles(full, acc);
    } else if (entry.endsWith('.ts')) {
      acc.push(full);
    }
  }
  return acc;
}

describe('architecture & security invariants', () => {
  it('enforces zero direct chrome.* or browser.* calls outside src/platform/', () => {
    const srcFiles = listTsFiles(resolve('src')).filter(
      (file) => !relative(resolve('src'), file).startsWith('platform/')
    );
    const forbidden = /\b(chrome|browser)\.(tabs|scripting|storage|runtime)\b/;

    for (const file of srcFiles) {
      const content = readFileSync(file, 'utf8');
      expect(content, `${file} must not access chrome.* or browser.* directly`).not.toMatch(
        forbidden
      );
    }
  });

  it('enforces zero cross-feature imports inside src/features/<name>/', () => {
    const featuresRoot = resolve('src/features');
    const featureDirs = readdirSync(featuresRoot).filter((entry) =>
      statSync(join(featuresRoot, entry)).isDirectory()
    );

    for (const featureName of featureDirs) {
      const dir = join(featuresRoot, featureName);
      expect(existsSync(join(dir, 'index.ts')), `${featureName} must have index.ts`).toBe(true);

      for (const file of listTsFiles(dir)) {
        const content = readFileSync(file, 'utf8');
        const imports = content.matchAll(/from\s+['"]([^'"]+)['"]/g);
        for (const match of imports) {
          const spec = match[1]!;
          const isSiblingFeatureImport = spec.startsWith('../') && !spec.startsWith('../../');
          expect(
            isSiblingFeatureImport,
            `${relative(process.cwd(), file)} must not import sibling feature "${spec}"`
          ).toBe(false);
        }
      }
    }
  });

  it('enforces zero innerHTML / outerHTML / insertAdjacentHTML in src/', () => {
    const srcFiles = listTsFiles(resolve('src'));
    const dangerous = /\.(innerHTML|outerHTML)\s*=|\.insertAdjacentHTML\s*\(/;

    for (const file of srcFiles) {
      const content = readFileSync(file, 'utf8');
      expect(content, `${file} contains unsafe HTML sink`).not.toMatch(dangerous);
    }
  });

  it('verifies every ADR in docs/decisions/ documents context, options, decision, and trade-offs', () => {
    const adrDir = resolve('docs/decisions');
    const files = readdirSync(adrDir).filter((f) => f.endsWith('.md'));
    expect(files.length).toBeGreaterThanOrEqual(5);

    for (const file of files) {
      const content = readFileSync(join(adrDir, file), 'utf8');
      expect(content, `${file} missing Context`).toContain('## Context');
      expect(content, `${file} missing Options Considered`).toContain('## Options Considered');
      expect(content, `${file} missing Decision`).toContain('## Decision');
      expect(content, `${file} missing Trade-offs`).toContain('## Trade-offs');
    }
  });
});
