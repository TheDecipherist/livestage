---
id: 24-fallback-contract
title: Fallback Contract
type: COMPONENT
path: Engine / Fallback Contract
source_files: [src/engine/stripper.ts]
status: complete
phase: all
last_synced: 2026-08-01
initiative: livestage
wave: livestage-wave-2
depends_on: [14-cr6-fallback-totality, 11-extension-routing, 12-render-trace]
tags: [fallback, strip, degraded-banner, timeout, graceful-absence]
known_issues:
  - "Confirmed: src/engine/context.ts owns nothing fallback-related (its one 'fallback' hit is an unrelated jail-resolution fallback). Removed from source_files; stripper.ts alone is the real home. There is no separate {directive, fallbackText} data table as an early draft of this doc's Data Model implied: stripNode's switch statement in stripper.ts IS the registry, implemented in code rather than as declarative data. Fallback text for nearly every directive is the empty string (its output vanishes, only surrounding prose survives); this is a deliberate, reasonable design for a degraded document, not a placeholder waiting to be filled in."
  - "@graph currently returns node.raw (its bare ARGUMENT text, not the '@graph ...' line) in both render (engine.ts) and strip (stripper.ts): live-checked, this is NOT a CR-11 violation (no '@'-prefixed syntax survives), just an inert not-yet-implemented stub; feature 34 (wave 5) owns the real behavior. See 16-cr11-markdown-out.md's known_issues for the same check."
  - "CR-6's registry-iterating test could not be written against a literal data table (none exists); written instead against the parser's real directive registry (getAvailableDirectives()), asserting stripNode handles a minimal fixture of every registered directive without throwing, plus a synthetic-node-type test proving the check actually catches an unhandled case. tests/unit/engine/fallback-registry.test.ts (27 tests)."
---

# Fallback Contract

## What to Build

`[new]`. The per-directive static fallback text registry, plus `strip` as
render's static twin (substituting declared fallbacks instead of resolved
results), plus the hook's timeout fail-open path (degraded banner and trace
flag).

## Architecture

This is the component that satisfies CR-6 (feature 14) at runtime. `strip`
and render share the same directive-walking code path; render substitutes
resolved results, strip substitutes declared fallbacks, both emit pure
markdown (spec line 81-83, Why This Shape). The hook (feature 11) calls into
this component's strip path on timeout.

## Implementation Notes

`src/engine/stripper.ts` is listed in the donor copy map (`[seeded->ext]` for
the CLI `strip` command per spec's dispositions table, "Rewrite: ... stripper
(render's static twin + fallback contract)," line 230-231) so this is a
rewrite-disposition component: the subject (strip) survives from the donor,
but the architecture changes to the fallback-registry model described here.
Confirmed during wave 2 build: there is no separate registry file; the
fallback registry IS `stripper.ts`'s `stripNode` switch statement, one case
per directive AST type, most returning `''` (a deliberate choice, not a
placeholder), `graph`/`passthrough` returning their raw source text.

## Data Model

The fallback "registry" is `stripNode`'s switch, not a `{ directive,
fallbackText }` data table: each `case` IS that directive's fallback
definition. CR-6's registry-iterating test walks the parser's real directive
registry (`getAvailableDirectives()`) instead and asserts `stripNode` handles
each one.

## API/Interface

`livestage strip <file> -o <file.md>` (line 519). No directive-level
interface; consumed internally by strip and by the hook's timeout path.

## Business Rules

1. Every directive declares static fallback text (line 116-118, CR-6).
2. `strip` substitutes declared fallbacks; render substitutes resolved
   results; both are the same operation with different data and both emit
   pure markdown (line 81-83).
3. Hook timeout (default 5000 ms) fails open: strip output plus a leading
   `> [!NOTE] degraded render` banner; trace records `degraded: true`
   (line 470-473, shared acceptance with feature 11).

## Acceptance Criteria

- [x] `strip` on a fixture doc using every directive type produces valid
      markdown without throwing. No golden-snapshot harness exists yet (that
      belongs to feature 42/43's corpus tooling); verified instead by
      `tests/unit/engine/fallback-registry.test.ts` exercising a real
      fixture per registered directive (26 cases) plus the pre-existing
      `stripper.test.ts` (32 tests).
- [!] A simulated hook timeout produces the degraded banner plus strip
      output (verified, feature 11), but the render trace record's
      `degraded: true` is NOT wired: the spawned child process's trace run
      is a separate process/invocation from the hook's. Same gap already
      recorded in 11-extension-routing.md's known_issues; not fixed here.
- [x] CR-6's registry-iterating test passes against the real directive
      registry, and a synthetic unhandled-node-type case proves the test
      actually catches a missing fallback (not vacuous):
      `fallback-registry.test.ts` (27 tests total).

## Dependencies

14-cr6-fallback-totality (this component is what makes CR-6 true),
11-extension-routing (hook timeout consumes this component's strip path),
12-render-trace (degraded flag is recorded here).

## Known Issues

See the frontmatter `known_issues` above: the `context.ts` source_files
correction, the `@graph` CR-11 gap (feature 34's job to fix), and the
registry-test approach against the real parser registry rather than a data
table that doesn't exist.
