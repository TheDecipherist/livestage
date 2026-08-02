---
id: 24-fallback-contract
title: Fallback Contract
type: COMPONENT
path: Engine / Fallback Contract
source_files: [src/engine/context.ts, src/engine/stripper.ts]
status: planned
phase: idle
last_synced: 2026-08-01
initiative: livestage
wave: livestage-wave-2
depends_on: [14-cr6-fallback-totality, 11-extension-routing, 12-render-trace]
tags: [fallback, strip, degraded-banner, timeout, graceful-absence]
known_issues: []
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
The exact file that owns the fallback registry itself is not named in the
Project Structure listing; `src/engine/context.ts` is inferred as the most
likely home (fallback text is per-directive static data available wherever
directive context is resolved) and should be confirmed during Wave 2 build.

## Data Model

Fallback registry entry per directive: `{ directive: string, fallbackText:
string }`. One entry per directive in the registry (feature 09); CR-6's
registry-iterating test walks this exact structure.

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

- [ ] `strip` on a fixture doc using every directive type produces valid
      markdown built entirely from declared fallback text, matching a golden
      snapshot.
- [ ] A simulated hook timeout produces the degraded banner plus strip
      output, and the render trace record has `degraded: true`.
- [ ] CR-6's registry-iterating test (feature 14) passes against this
      registry's contents.

## Dependencies

14-cr6-fallback-totality (this component is what makes CR-6 true),
11-extension-routing (hook timeout consumes this component's strip path),
12-render-trace (degraded flag is recorded here).

## Known Issues

The exact source file owning the fallback registry is inferred
(`src/engine/context.ts`) rather than explicitly named by the spec's Project
Structure listing; confirm and update `source_files` during Wave 2 build.
