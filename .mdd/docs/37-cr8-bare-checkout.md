---
id: 37-cr8-bare-checkout
title: "CR-8: Bare Checkout"
type: SPEC
path: Contracts / Bare Checkout
source_files: []
test_files: [tests/e2e/bare-checkout.test.ts]
status: complete
phase: all
last_synced: 2026-08-02
initiative: livestage
wave: livestage-wave-6
depends_on: []
tags: [contract, bare-checkout, bundle-only, e2e, no-install-step]
known_issues:
  - "Building the e2e test (tests/e2e/bare-checkout.test.ts) surfaced two
    real bugs in the bundle the contract exists to catch, neither visible
    from the source-tree test suite since every unit test runs against
    src/ or the multi-file tsc dist/, never the single-file bundle: (1)
    esbuild's ESM output for commander (a CJS package) left a dynamic
    require() with no real require in scope, throwing on the very first
    import; fixed with an esbuild --banner:js createRequire(import.meta.url)
    polyfill (package.json's bundle script). (2) cli.ts's package.json
    version read used a hardcoded two-levels-up path correct only for the
    tsc dist/cli/ layout; one level up under the flat bundle, and neither
    level exists in a checkout with no package.json at all. Fixed by trying
    both candidate depths and falling back to a placeholder version string
    rather than crashing every command, not just --version, on a path
    assumption that held for one build target and not the other."
---

# CR-8: Bare Checkout

## What to Build

A behavior contract: `render`, `validate`, `assert` succeed on a fresh clone
with only `dist/livestage.js` present, no install step.

## Architecture

The contract feature 41 (Bundle) exists to satisfy; also the acceptance
target for feature 47 (Reach Via Code)'s worked examples, which must not
introduce a runtime dependency the bundle doesn't already carry.

## Implementation Notes

This is what makes LiveStage usable as a CI gate without a build step:
"CI and interactive sessions run the same commands, so there is no separate
CI mode to drift" (line 70-72). The bare-checkout e2e is the sharpest version
of that claim.

## Data Model

N/A.

## API/Interface

N/A. Verified by an e2e test that clones (or simulates a clone of) the repo,
deletes everything except `dist/livestage.js`, and runs `render`/`validate`/
`assert` against fixture docs.

## Business Rules

1. `render`, `validate`, `assert` succeed on a fresh clone with only
   `dist/livestage.js` present (line 742-743).
2. No install step is required (line 743).

## Acceptance Criteria

- [x] An e2e test with only `dist/livestage.js` present (no `node_modules`,
      no source) runs `render`, `validate`, and `assert` against fixture
      `.stage` docs successfully. tests/e2e/bare-checkout.test.ts.
- [x] The same e2e test is part of the CI suite, not a manual-only check.
      `.github/workflows/ci.yml` runs `npm test`, which picks up
      `tests/e2e/**/*.test.ts` via vitest.config.ts's include glob; the test
      itself runs `npm run bundle` in `beforeAll` so it always exercises the
      bundle built from current source.

## Dependencies

None.

## Known Issues

None.
