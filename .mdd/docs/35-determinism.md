---
id: 35-determinism
title: Determinism
type: COMPONENT
path: Engine / Determinism
source_files: [src/engine/determinism.ts]
status: planned
phase: idle
last_synced: 2026-08-01
initiative: livestage
wave: livestage-wave-5
depends_on: [21-cache, 18-compute-directives]
tags: [determinism, frozen-clock, seeded-uuid, mock-fixtures, byte-identical]
known_issues: []
---

# Determinism

## What to Build

`[new; donor cache mocks + sandbox builtins]`. `LIVESTAGE_DETERMINISTIC=1`
(or `--deterministic`): frozen clock (`LIVESTAGE_NOW`), seeded UUIDs
(`LIVESTAGE_SEED`), env-overridable paths, `@cache mock=fixture.json` serves
fixtures for `@query` and `@code`. Two deterministic runs of the same
document must be byte-identical.

## Architecture

This is what makes golden-file testing the default for the entire render
surface (line 546-548): every directive, every format, every fallback path
can be snapshot-tested because determinism removes wall-clock time, random
UUIDs, and live shell/code output as sources of variance.

## Implementation Notes

`@cache mock=fixture.json` is the mechanism by which `@query` and `@code`
become deterministic: instead of executing, they serve a recorded fixture
(feature 21 owns the underlying cache read path; this component owns the
mock-selection and clock/uuid-freezing logic).

## Data Model

N/A (env/flag-driven runtime mode, not a persisted data model).

## API/Interface

- Flag: `--deterministic`; env: `LIVESTAGE_DETERMINISTIC=1`.
- `LIVESTAGE_NOW` (frozen clock), `LIVESTAGE_SEED` (seeded UUIDs).
- `@cache mock=fixture.json` on `@query`/`@code`.

## Business Rules

1. Frozen clock via `LIVESTAGE_NOW` (line 543-544).
2. Seeded UUIDs via `LIVESTAGE_SEED` (line 544).
3. Env-overridable paths (line 544).
4. `@cache mock=fixture.json` serves fixtures for `@query` and `@code`
   (line 545).
5. Two deterministic runs of the same document are byte-identical (line
   546-547).

## Acceptance Criteria

- [ ] Two `--deterministic` renders of the same document, with the same
      `LIVESTAGE_NOW`/`LIVESTAGE_SEED`, produce byte-identical output
      (Wave 5 demo-state, line 635-636).
- [ ] `@date` under `--deterministic` reflects `LIVESTAGE_NOW`, not wall-clock
      time.
- [ ] A `@query`/`@code` call with `@cache mock=fixture.json` under
      `--deterministic` returns the fixture content instead of executing.
- [ ] Golden-file snapshots for every directive, format, and fallback path
      pass under `--deterministic`.

## Dependencies

21-cache (mock-fixture serving reuses the cache read path), 18-compute-
directives (the directives being made deterministic).

## Known Issues

None.
