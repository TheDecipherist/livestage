---
id: 35-determinism
title: Determinism
type: COMPONENT
path: Engine / Determinism
source_files: [src/engine/determinism.ts, src/engine/context.ts, src/engine/engine.ts,
  src/engine/sources.ts, src/engine/engine-interpolate.ts, src/engine/conditions.ts,
  src/engine/code-runners.ts, src/parser/directives/query.ts, src/parser/directives/code.ts,
  src/parser/types.ts, src/cli/cli.ts, src/cli/commands/render.ts]
status: complete
phase: all
last_synced: 2026-08-02
initiative: livestage
wave: livestage-wave-5
depends_on: [21-cache, 18-compute-directives]
tags: [determinism, frozen-clock, seeded-uuid, mock-fixtures, byte-identical]
known_issues:
  - "This turned out to be almost entirely greenfield, not '[new; donor cache
    mocks + sandbox builtins]' as originally scoped: grep against the pre-wave-5
    tree found zero references to LIVESTAGE_NOW/LIVESTAGE_SEED/LIVESTAGE_DETERMINISTIC
    anywhere in src/, @date used bare `new Date()`, and now_iso/now_ms/uuid_v4
    in both conditions.ts and engine-interpolate.ts used real Date/Math.random
    with no seed path at all. The 'donor mocks' the doc's What to Build
    referred to (parser/args.ts's parseCacheTokens, a multi-token `@cache
    session|persist|mock=... ttl=... /` sub-syntax, and CacheConfig fields on
    ListNode/ReadNode/TreeNode/QueryNode/IncludeNode/ImportNode) exist but are
    dead: every current v2.0 DirectiveInput-based parse() function hardcoded
    `cache: null` unconditionally, so no directive could ever reach cache.ts's
    mock/session/persist modes through real .stage syntax, only through direct
    unit calls into cache.ts itself (tests/unit/engine/cache.test.ts). This is
    a real, pre-wave-5 gap in feature 21 (Cache), not something introduced
    here."
  - "Rather than resurrect the orphaned args.ts multi-token @cache syntax,
    mock-serving for @query and @code was wired as a plain `mock=\"path\"`
    attribute directly on each directive's own opener line (query.ts:12-19,
    code.ts:29-42), consistent with the rest of the v2.0 grammar's key=value
    attrs. session/persist cache modes for @query/@code, and mock/session/
    persist for @list/@read/@tree/@include/@import, remain unreachable from
    real documents; only the mock path needed by this feature's business rule
    4 was closed. Resurrecting the rest is feature 21's debt, not filed as a
    new known_issue on that already-complete doc since it was never a
    regression, just an always-dead path."
  - "'Env-overridable paths' (business rule 3) was interpreted narrowly: the
    frozen clock and seeded uuid are the two literal mechanisms the wave-5
    demo-state exercises (byte-identical renders), and no other source of
    render-visible non-determinism was found in the render path itself.
    @code's temp script directory (code-runners.ts, mkdtempSync) uses an
    OS-random suffix, but that path is never embedded in rendered output
    (only used as a scratch location to invoke the runner), so it was left
    as-is rather than inventing an env override for it."
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

- [x] Two `--deterministic` renders of the same document, with the same
      `LIVESTAGE_NOW`/`LIVESTAGE_SEED`, produce byte-identical output
      (Wave 5 demo-state, line 635-636). Live-verified via the built CLI
      binary (`node dist/cli/cli.js render ... --deterministic` run twice
      a second apart, `diff` clean); also
      tests/unit/engine/determinism.test.ts::"two renders of the same
      document with the same env are byte-identical, including uuid_v4()
      output".
- [x] `@date` under `--deterministic` reflects `LIVESTAGE_NOW`, not wall-clock
      time. src/engine/sources.ts:231; tests/unit/engine/determinism.test.ts::"@date
      reflects LIVESTAGE_NOW under deterministic mode, not wall-clock time".
- [x] A `@query`/`@code` call with `mock="fixture.json"` under
      `--deterministic` returns the fixture content instead of executing.
      Syntax is a plain `mock=` attribute rather than the dead `@cache
      mock=...` sub-syntax (see known_issues). Live-verified for both
      directives via the built CLI; tests/unit/engine/determinism.test.ts::"@query
      mock= serves the fixture..." and "@code mock= serves the fixture...";
      tests/unit/engine/code-runners.test.ts::"mock= serves the fixture and
      never spawns the runner, even for an ungranted language".
- [!] Golden-file snapshots for every directive, format, and fallback path
      pass under `--deterministic`. No golden-file snapshot suite exists yet
      (the render surface has no such harness); this criterion describes a
      downstream consequence of determinism existing (CR-10's corpus-wide
      purity harness, feature 42, wave 6), not something this feature builds
      itself. The building block (frozen clock + seeded uuid + mock cache)
      is complete and independently tested above.

## Dependencies

21-cache (mock-fixture serving reuses the cache read path), 18-compute-
directives (the directives being made deterministic).

## Known Issues

None.
