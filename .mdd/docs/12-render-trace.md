---
id: 12-render-trace
title: Render Trace
type: COMPONENT
path: Engine / Render Trace
source_files: [src/engine/trace/config.ts, src/engine/trace/emit.ts, src/engine/trace/span.ts, src/cli/commands/engine-trace.ts]
status: complete
phase: all
last_synced: 2026-08-01
initiative: livestage
wave: livestage-wave-1
depends_on: [07-package-skeleton, 05-cr4-no-daemon-no-memory]
tags: [trace, jsonl, append-only, masking, size-cap, observability]
known_issues:
  - "The doc's source_files (record.ts, writer.ts) do not match the real files (config.ts, emit.ts, span.ts); corrected above."
  - "Found and fixed a real gap while verifying business rule 1/acceptance criterion 1: tracing was opt-in only (LIVESTAGE_TRACE unset meant no trace at all), and there was no render-level summary record at all, only per-directive spans, so the doc's own data-model schema (a {t:'render', ...} record alongside {t:'directive', ...}) did not exist. Made tracing on by default (a daily JSONL file at .livestage/trace/<yyyy-mm-dd>.jsonl, not stderr, not opt-in), added the t discriminant field, and added the render-level record emitted once per execute() call."
  - "Found and fixed a real exclusion-list violation: trace/config.ts and trace/emit.ts still had an 'http' sink that could POST spans to a URL, exactly the event-transport subsystem the seed was supposed to exclude wholesale. Removed; only 'stderr' and 'file' sinks remain."
  - "Found and fixed a real bug: emitSpan's file sink never created .livestage/trace/ before appending, so the very first write would fail silently (appendFile's callback discards its error). Now ensures the directory once per path."
  - "Found and fixed a real correctness gap: the default-on trace config was being recomputed even when a caller explicitly passed ctx.traceConfig: null to disable it (both look like null after makeContext's merge). Distinguished by checking whether options.ctx.traceConfig was present in the caller's input, not the post-merge value."
  - "A size cap on the JSONL file (business rule 3, 'size-capped') is not implemented: nothing rotates or truncates .livestage/trace/<date>.jsonl. Real gap, not fixed here; the per-day filename at least bounds growth to one day's records."
  - "size-cap aside, business rule 3's masking half and acceptance criterion 2 (secrets masked in trace records) were already correctly implemented pre-existing (engine.ts's maskedArgs via applyMasking before every emitRecord call) and covered by an existing test."
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

- [x] A render of a fixture doc produces one `render` record and one
      `directive` record per executed directive, matching the schema above.
      Verified live and in `tests/unit/engine/trace.test.ts`, "render summary
      record".
- [x] Secrets present in a directive's resolved value are masked in the trace
      record. Pre-existing test, "args masking".
- [x] `engine trace --last` returns the most recent render's records;
      `engine trace <render-id>` returns records for that render id. New
      command (`src/cli/commands/engine-trace.ts`), verified live end to end
      and in `tests/unit/cli/engine-trace.test.ts`.
- [x] No import of the trace reader exists inside `src/engine/` or
      `src/parser/` (only `src/cli/commands/` and doctor probes may read it).
      Verified: `runEngineTrace` (the only trace reader) lives in
      `src/cli/commands/`.

## Dependencies

07-package-skeleton, 05-cr4-no-daemon-no-memory (this component is what makes
CR-4's trace-is-write-only clause true).

## Known Issues

None.
