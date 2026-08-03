// contrast-check.template.ts -> copy to tests/a11y/contrast.spec.ts
//
// Rendered WCAG contrast gate. Exists because static checks structurally
// cannot catch the real failure mode: a vendor stylesheet inside node_modules
// setting `fill`/`color` on descendants through hashed class names, colors
// that appear NOWHERE in the project's own source. Only computed styles after
// the full cascade tell the truth (see rules/accessibility.md, third-party
// components).
//
// Setup (once):
//   npm i -D @playwright/test @axe-core/playwright
//   List ROUTES below: every page this feature touches PLUS every page that
//   mounts a third-party component (editors, date pickers, charts, auth
//   widgets), even when the diff merely mounted it.
//
// Run: npx playwright test tests/a11y/contrast.spec.ts
//
// Rules of this gate:
// - BOTH color schemes, always. A light-only pass reports a dark-theme
//   disaster as fine.
// - Violations FAIL, never warn. The failure output names the selector, both
//   colors, and the measured ratio (axe's failureSummary carries them).
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

// Every route hosting this feature or any third-party component.
const ROUTES: string[] = ['/'];

// Optional: selectors to wait for per route before scanning (lazy-mounted
// vendor components must be on screen to be measured).
const READY: Record<string, string> = {};

for (const scheme of ['light', 'dark'] as const) {
  test.describe(`contrast, ${scheme} scheme`, () => {
    test.use({ colorScheme: scheme });

    for (const route of ROUTES) {
      test(`${route} has no color-contrast violations`, async ({ page }) => {
        await page.goto(route);
        if (READY[route]) await page.waitForSelector(READY[route]);

        const results = await new AxeBuilder({ page })
          .withRules(['color-contrast'])
          .analyze();

        const failures = results.violations.flatMap((v) =>
          v.nodes.map(
            (n) => `${n.target.join(' ')}\n    ${n.failureSummary ?? v.help}`,
          ),
        );
        expect(failures, `color-contrast (${scheme}):\n${failures.join('\n')}`)
          .toEqual([]);
      });
    }
  });
}
