---
id: 12-render-trace
title: Render Trace
type: COMPONENT
path: Engine / Render Trace
source_files: [src/engine/trace/record.ts, src/engine/trace/writer.ts]
status: planned
phase: idle
last_synced: 2026-08-01
initiative: livestage
wave: livestage-wave-1
depends_on: [07-package-skeleton, 05-cr4-no-daemon-no-memory]
tags: [trace, jsonl, append-only, masking, size-cap, observability]
known_issues: []
---

# Render Trace

## What to Build

`[new; donor trace subsystem]`, adapt from
`~/projects/markdownai/packages/engine/src/trace/*`. An append-only JSONL
writer at `.livestage/trace/<yyyy-mm-dd>.jsonl`, one record per directive
execution and one per render. Masked, size-capped, written directly by the
trace writer (no transport subsystem, that entire layer was excluded at
seed).

## Architecture

The one cross-invocation artifact the engine is permitted to leave (Principle
3, "the trace is a log, never a memory," line 94). The engine itself never
reads the trace back (CR-4, feature 05); only `livestage engine trace` and
`doctor` read it.

## Implementation Notes

Adapting the donor trace subsystem means stripping the parts that assumed a
transport (file/log/http/websocket/db/vscode dispatch worker), which were
excluded wholesale at seed (spec line 189-190). What survives is the record
schema and a direct-to-file writer.

## Data Model

```json
{ "t": "directive", "render_id": "...", "doc": "...", "directive": "query",
  "line": 41, "ms": 12, "result_hash": "...", "degraded": false }
{ "t": "render", "render_id": "...", "doc": "...", "ms": 180, "directives": 14,
  "degraded": false, "exit": 0 }
```

## API/Interface

`livestage engine trace [--last | <render-id>]` (line 507); consumed also by
`doctor` (trace path writable check, line 533).

## Business Rules

1. One JSONL file per day at `.livestage/trace/<yyyy-mm-dd>.jsonl`, append-only
   (line 495).
2. One record per directive execution, one per render (line 495-496).
3. Records are masked (secrets stripped before write) and size-capped
   (line 505).
4. Written directly by the trace writer; no transport subsystem (line
   505-506).
5. The engine never reads the trace (CR-4, line 506-507).

## Acceptance Criteria

- [ ] A render of a fixture doc produces one `render` record and one
      `directive` record per executed directive, matching the schema above.
- [ ] Secrets present in a directive's resolved value are masked in the trace
      record.
- [ ] `engine trace --last` returns the most recent render's records;
      `engine trace <render-id>` returns records for that render id.
- [ ] No import of the trace reader exists inside `src/engine/` or
      `src/parser/` (only `src/cli/commands/` and doctor probes may read it).

## Dependencies

07-package-skeleton, 05-cr4-no-daemon-no-memory (this component is what makes
CR-4's trace-is-write-only clause true).

## Known Issues

None.
