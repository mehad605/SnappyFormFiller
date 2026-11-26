import { execFileSync } from 'node:child_process';
import { chmodSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const hookPath = resolve('.githooks/pre-commit');

try {
  if (existsSync('.git') && existsSync(hookPath)) {
    chmodSync(hookPath, 0o755);
    execFileSync('git', ['config', 'core.hooksPath', '.githooks'], { stdio: 'ignore' });
  }
} catch {
  // Ignore hook setup errors in CI or non-git tarballs.
}
