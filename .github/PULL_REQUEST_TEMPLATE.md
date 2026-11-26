## Summary
<!-- Briefly explain what changed and why. -->

## Checklist
- [ ] `npm run check` passes (lint, typecheck, format, unit tests, budgets)
- [ ] `npm run test:e2e` passes
- [ ] No direct `chrome.*` or `browser.*` calls outside `src/platform/browser.ts`
- [ ] No `innerHTML` usage in `src/`
- [ ] Tested on Chromium and Firefox builds (or noted any platform-specific behavior)
- [ ] Docs / ADRs updated if architecture, features, or permissions changed
