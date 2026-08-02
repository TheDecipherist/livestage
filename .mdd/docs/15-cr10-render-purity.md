---
id: 15-cr10-render-purity
title: "CR-10: Render Purity"
type: SPEC
path: Contracts / Render Purity
source_files: []
status: planned
phase: idle
last_synced: 2026-08-01
initiative: livestage
wave: livestage-wave-2
depends_on: []
tags: [contract, purity, filesystem-snapshot, harness, no-side-effects]
known_issues: []
---

# CR-10: Render Purity

## What to Build

A behavior contract: rendering any corpus document produces zero filesystem
mutations outside explicit `@update-frontmatter` targets. A before/after
snapshot harness wraps every integration test.

## Architecture

The direct check on Principle 4 ("Reads are pure. One sanctioned write
exists, `@update-frontmatter` ... `@code` under policy is the escape hatch
for everything else," line 95-97) and on the project's "Not a scaffolder"
exclusion (line 52-54: no file or directory creation, no copies, no appends
outside the one sanctioned write).

## Implementation Notes

The harness (owned by feature 42, Contract Scans, under `tests/purity/`) must
wrap every integration test, not run as a separate suite, so purity
violations are caught at the point of the test that introduced them rather
than in a late, hard-to-bisect sweep.

## Data Model

N/A.

## API/Interface

N/A. Satisfied by the `tests/purity/` before/after filesystem snapshot
harness (feature 42).

## Business Rules

1. Rendering any corpus document produces zero filesystem mutations outside
   explicit `@update-frontmatter` targets (line 750-751).
2. The before/after snapshot harness wraps every integration test
   (line 751-752).

## Acceptance Criteria

- [ ] A filesystem snapshot taken before and after rendering a large fixture
      corpus (including docs using every read-side directive) is identical
      except for explicit `@update-frontmatter` targets.
- [ ] A deliberately broken directive that writes a stray file fails the
      harness (proving the harness actually catches violations).
- [ ] Every integration test in `tests/integration/` runs inside the harness.

## Dependencies

None.

## Known Issues

None.
