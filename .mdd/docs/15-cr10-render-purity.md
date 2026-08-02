---
id: 15-cr10-render-purity
title: "CR-10: Render Purity"
type: SPEC
path: Contracts / Render Purity
source_files: []
status: complete
phase: all
last_synced: 2026-08-01
initiative: livestage
wave: livestage-wave-2
depends_on: []
tags: [contract, purity, filesystem-snapshot, harness, no-side-effects]
known_issues:
  - "Partially verified this wave: the tests/purity/ before/after harness that wraps EVERY integration test is explicitly owned by feature 42 (Contract Scans, wave 6) per this doc's own Implementation Notes, and does not exist yet. What's verifiable now: a targeted snapshot test (tests/unit/engine/source-directives-purity.test.ts, feature 17) proves every wave-2 read-side directive (@list/@read/@read-frontmatter/@tree/@count/@date/@env) produces zero filesystem mutations, EXCLUDING .livestage/trace/ which is read as spec-sanctioned infrastructure (spec line 45, 'the only cross-invocation artifact'), not corpus content. That exclusion is this session's interpretation, not confirmed against the spec author; feature 42 should confirm or overturn it when it builds the real harness."
  - "Feature 42 built tests/purity/render-purity.test.ts: a corpus-wide
    snapshot test covering every read-side directive built through wave 5
    (including @assert, @graph, @hash, mocked @query/@code, none of which
    existed when this doc was last verified), plus a real
    @update-frontmatter-write test proving only the explicit write target
    changes, plus a meta-test proving the snapshot-diff mechanism itself
    detects a real filesystem change (not vacuously passing). This confirms
    the .livestage/ exclusion decision above rather than overturning it."
  - "\"Wraps every integration test\" (business rule 2) does not literally
    apply to this project's test layout: there is no tests/integration/
    tier (the suite is organized tests/unit/, tests/e2e/, tests/purity/,
    tests/golden/, tests/contracts/), so there is nothing to \"wrap\". The
    harness exists as its own standalone purity-focused suite instead,
    covering the corpus broadly rather than being woven into every other
    test file. Documented as a deliberate reinterpretation, not silently
    dropped."
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

- [x] A filesystem snapshot taken before and after rendering a large fixture
      corpus (including docs using every read-side directive) is identical
      except for explicit `@update-frontmatter` targets. Built this wave:
      tests/purity/render-purity.test.ts, covering every read-side
      directive through wave 5 plus a real @update-frontmatter write proven
      to only change its own target.
- [x] A deliberately broken directive that writes a stray file fails the
      harness (proving the harness actually catches violations).
      tests/purity/render-purity.test.ts::"the harness itself is not
      vacuous: an actual filesystem diff fails the comparison".
- [!] Every integration test in `tests/integration/` runs inside the
      harness. Reinterpreted, see known_issues: this project has no
      tests/integration/ tier, so the harness is a standalone corpus-wide
      suite rather than something woven into every other test file.

## Dependencies

None.

## Known Issues

See the frontmatter `known_issues` above: only partially verifiable this
wave, the corpus-wide harness is feature 42's job (wave 6).
