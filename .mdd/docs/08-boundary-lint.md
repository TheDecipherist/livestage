---
id: 08-boundary-lint
title: Boundary Lint
type: COMPONENT
path: Build / Boundary Lint
source_files: [eslint.config.js]
status: planned
phase: idle
last_synced: 2026-08-01
initiative: livestage
wave: livestage-wave-1
depends_on: [07-package-skeleton]
tags: [module-boundaries, lint, eslint, import-rules, architecture-enforcement]
known_issues: []
---

# Boundary Lint

## What to Build

`[new]`, no donor source. Lint rules enforcing internal module import
boundaries: `parser` never imports `renderer`; `cli` orchestrates other
modules but is not imported by them; `hook` calls the same code path as
`cli render` (i.e. it imports `cli`'s render entry point, not a parallel
implementation). Violations fail lint, not just a manual review.

## Architecture

Runs at build/CI time via `eslint.config.js` (already the target of feature 07
for baseline config; this feature adds the boundary-specific rules on top).
Part of the Wave 1 demo-state: "boundary lint ... green" (line 570).

## Implementation Notes

The rule set is likely built on an import-restriction plugin
(`eslint-plugin-import`'s `no-restricted-paths` or equivalent) configured with
the four module groups (`parser`, `engine`, `renderer`, `cli`, `hook`) and the
one asymmetric rule: `hook` must import `cli`'s render path rather than
reimplementing render logic, which is what makes "the hook renders via the
same code path as `cli render`" (Hook Contracts, line 468-469) a checked
invariant instead of a convention that quietly drifts.

## Data Model

N/A.

## API/Interface

N/A. A lint rule set, invoked via `npm run lint` / CI, no runtime interface.

## Business Rules

1. `parser` never imports `renderer` (line 145-146).
2. `cli` orchestrates; other modules do not import `cli` (line 146).
3. `hook` calls the same code path as `cli render` (line 146, 468-469).

## Acceptance Criteria

- [ ] A fixture violation (e.g. an import from `src/parser` into
      `src/renderer`) fails lint.
- [ ] A fixture violation where `src/hook/pretooluse.ts` reimplements render
      logic instead of importing the `cli render` path fails lint (or is
      caught by a targeted test if the import-restriction plugin cannot
      express "must call," only "must not import elsewhere").
- [ ] `npm run lint` is green on the seeded, correctly-structured repo.

## Dependencies

07-package-skeleton (lint config layers onto the base eslint config).

## Known Issues

None.
