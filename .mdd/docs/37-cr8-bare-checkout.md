---
id: 37-cr8-bare-checkout
title: "CR-8: Bare Checkout"
type: SPEC
path: Contracts / Bare Checkout
source_files: []
status: planned
phase: idle
last_synced: 2026-08-01
initiative: livestage
wave: livestage-wave-6
depends_on: []
tags: [contract, bare-checkout, bundle-only, e2e, no-install-step]
known_issues: []
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

- [ ] An e2e test with only `dist/livestage.js` present (no `node_modules`,
      no source) runs `render`, `validate`, and `assert` against fixture
      `.stage` docs successfully.
- [ ] The same e2e test is part of the CI suite, not a manual-only check.

## Dependencies

None.

## Known Issues

None.
