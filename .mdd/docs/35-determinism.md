---
id: 35-determinism
title: Determinism
type: COMPONENT
path: Engine / Determinism
source_files: [src/engine/determinism.ts, src/engine/context.ts, src/engine/engine.ts,
  src/engine/sources.ts, src/engine/engine-interpolate.ts, src/engine/conditions.ts,
  src/engine/code-runners.ts, src/engine/engine-include.ts, src/parser/directives/query.ts,
  src/parser/directives/code.ts, src/parser/directives/list.ts, src/parser/directives/read.ts,
  src/parser/directives/tree.ts, src/parser/directives/include.ts, src/parser/directives/import.ts,
  src/parser/directives/cache-attrs.ts, src/parser/types.ts, src/cli/cli.ts, src/cli/commands/render.ts]
test_files: [tests/golden/deterministic-snapshots.test.ts, tests/golden/fixtures.ts]
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
  - "RESOLVED (post-initiative known_issues sweep, 2026-08-02): rather than
    resurrect the orphaned args.ts multi-token @cache syntax, the same plain
    key=value convention this feature shipped for `mock=\"path\"` was
    extended to a `cache=\"session\"|\"persist\"` attribute (optional
    `ttl=` for persist), parsed by the new shared
    src/parser/directives/cache-attrs.ts and applied to every directive that
    carries a CacheConfig: @list, @read, @tree, @query, @code, @include.
    @import intentionally still parses cache: null (see its own inline
    comment): it is side-effect only, registering macros/env fallbacks into
    ctx with nothing renderable to cache. Every wiring site follows the same
    security rule: path/shell/grant checks always run live, cache hit or
    not, only the actual read/spawn/render is what a hit skips (see
    21-cache.md's known_issues for the full mechanism). Live-verified
    against the built binary: session mode does not survive a fresh CLI
    process, persist mode does (confirmed via `cache show` and
    `.livestage/cache/` contents across two separate invocations)."
  - "RESOLVED (post-initiative known_issues sweep, task 35, 2026-08-02): the
    acceptance criterion's golden-file snapshot suite now exists,
    tests/golden/deterministic-snapshots.test.ts, covering every registered
    directive (27, via the shared tests/golden/fixtures.ts table), every
    @render format (9), and three representative fallback/degraded paths.
    See the acceptance criteria below for the full description."
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
- `mock="fixture.json"` on `@list`/`@read`/`@tree`/`@query`/`@code`/`@include`.
- `cache="session"|"persist"` (optional `ttl="<seconds>"` for persist) on the
  same six directives, for caching a real result rather than substituting a
  fixture; not deterministic-mode-specific, works with or without
  `--deterministic`.

## Business Rules

1. Frozen clock via `LIVESTAGE_NOW` (line 543-544).
2. Seeded UUIDs via `LIVESTAGE_SEED` (line 544).
3. Env-overridable paths (line 544).
4. `@cache mock=fixture.json` serves fixtures for `@query` and `@code`
   (line 545). Extended (post-initiative sweep) to `@list`/`@read`/`@tree`/
   `@include` too, plus `cache="session"|"persist"` for caching a real
   result on all six, see known_issues.
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
- [x] `mock=`/`cache=` reach all six source-shaped directives (@list, @read,
      @tree, @query, @code, @include), not just @query/@code, and a cache
      hit never skips a security check. tests/unit/engine/directive-cache.test.ts
      (15 tests: parseCacheAttrs unit coverage, session mode not surviving a
      fresh process, persist mode surviving one, the security check running
      live on every call including cache hits, @code's label= data replaying
      correctly from a cache hit, @include's mock= never touching its real
      target). Live-verified against the built binary for @list session mode
      and @read persist mode (including `cache show` seeing the entry).
- [x] Golden-file snapshots for every directive, format, and fallback path
      pass under `--deterministic`. `tests/golden/deterministic-snapshots.test.ts`
      (post-initiative sweep, task 35, 2026-08-02): reuses the exact
      directive fixture table `tests/golden/fixtures.ts` maintains for CR-11
      (one fixture per registered directive, 27), so this can't silently
      drift from "every directive" as the registry grows; adds fixtures for
      all nine `@render` formats and three representative fallback/degraded
      paths (a missing file, a blocked path traversal, a policy-blocked
      shell command). Each of the 39 cases renders twice under a fixed
      `LIVESTAGE_NOW`/`LIVESTAGE_SEED`, asserts byte-identical output between
      the two runs (business rule 5, registry-wide), and snapshots the
      result via vitest's `toMatchSnapshot()`, the actual checked-in
      golden-file mechanism, not a re-run comparison alone. Proven non-vacuous:
      a companion test confirms the frozen `@date` output differs from a
      real wall-clock render, and a different `LIVESTAGE_SEED` changes
      `uuid_v4()` output. This is independent of, not blocked by, CR-10's
      corpus-wide purity harness (feature 42, wave 6): that harness checks
      markdown purity across the doc corpus, this one checks byte-identical
      stability under determinism specifically.

## Dependencies

21-cache (mock-fixture serving reuses the cache read path), 18-compute-
directives (the directives being made deterministic).

## Known Issues

See the frontmatter `known_issues` above: the first three entries are
RESOLVED (the plain-attribute `mock=`/`cache=`/`ttl=` convention now reaches
all six source-shaped directives, replacing the dead donor multi-token
@cache syntax; the golden-snapshot suite now exists); the fourth
(env-overridable paths interpreted narrowly to the frozen clock and seeded
uuid) stands as a scope note, not a gap.
