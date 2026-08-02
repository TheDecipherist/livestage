---
id: 05-cr4-no-daemon-no-memory
title: "CR-4: No Daemon, No Memory"
type: SPEC
path: Contracts / No Daemon No Memory
source_files: []
status: planned
phase: idle
last_synced: 2026-08-01
initiative: livestage
wave: livestage-wave-1
depends_on: []
tags: [contract, statelessness, trace, no-server, ci-scan]
known_issues: []
---

# CR-4: No Daemon, No Memory

## What to Build

A behavior contract: no listening socket, server entrypoint, daemon lifecycle,
or cross-invocation state store exists in `src/`. The render trace is written
and never read back by the engine (scan target: no trace-read import outside
`cli/commands` and `doctor`).

## Architecture

Directly shapes feature 12 (Render Trace): the trace writer is append-only and
the engine's own execution path holds no reference to a reader. Also the
reason Principle 3 exists ("Stateless, cold, memoryless" - every invocation
stands alone, `@set` scopes to a single render pass, the trace is a log, never
a memory, line 93-94).

## Implementation Notes

This is the contract the "Known gaps" cold-start ladder (spec line 866-887)
explicitly must never jump ahead of: a resident render daemon over a unix
socket is named as a last resort, evidence-gated, and must never be built
speculatively because it would amend this exact contract. If cold-start ever
gets that far, treat it as a CR-4 amendment decision, not a routine
optimization.

## Data Model

The trace record schema (feature 12) is the only cross-invocation artifact
this contract permits, and it is write-only from the engine's perspective:

```json
{ "t": "directive", "render_id": "...", "doc": "...", "directive": "query",
  "line": 41, "ms": 12, "result_hash": "...", "degraded": false }
{ "t": "render", "render_id": "...", "doc": "...", "ms": 180, "directives": 14,
  "degraded": false, "exit": 0 }
```

## API/Interface

N/A. Satisfied by feature 12's implementation plus feature 42's scan.

## Business Rules

1. No listening socket, server entrypoint, daemon lifecycle, or
   cross-invocation state store exists in `src/` (line 725-727).
2. The engine never reads the trace back; only `cli/commands` (e.g.
   `engine trace`) and `doctor` may import a trace reader (line 727-728,
   also CR-4 line 506-507).

## Acceptance Criteria

- [ ] Scan finds no `net.createServer`, `http.createServer`, socket listener,
      or equivalent anywhere in `src/`.
- [ ] Scan finds no trace-read import outside `src/cli/commands/` and the
      doctor probes.
- [ ] `@set` is proven scoped to a single render pass (a test that two
      sequential renders of the same doc do not see each other's `@set`
      values).

## Dependencies

None.

## Known Issues

None.
