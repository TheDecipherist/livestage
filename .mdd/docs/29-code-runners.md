---
id: 29-code-runners
title: Code Runners
type: COMPONENT
path: Engine / Code Runners
source_files: [src/parser/directives/code.ts, src/engine/code-runners.ts]
status: planned
phase: idle
last_synced: 2026-08-01
initiative: livestage
wave: livestage-wave-4
depends_on: [10-security-policy-core, 18-compute-directives]
tags: [code, runners, sandboxed-execution, temp-script, granted-languages]
known_issues: []
satisfies_contracts:
  - from: 10-security-policy-core
    function: enforcePolicy
    when: always
    status: pending
    verified_at: ""
---

# Code Runners

## What to Build

`[new; donor query/test exec plumbing + shell enforcement]`. The `@code`
directive: self-closing with `src` (language inferred from extension when
omitted) or block-with-body. Runner map from policy config
(`javascript -> node`, `python -> python3`, `bash -> bash`, extensible).
Results: `_exit`, `_stdout`, `_stderr`, `_duration`; if stdout parses as JSON
it binds as structured data under `label`. Context in via
`LIVESTAGE_CONTEXT` (JSON: args, vars, doc path) and stdin; `{{ }}`
interpolation inside the body is opt-in (`interpolate=true`).

## Architecture

Runner invocations resolve through the same shell enforcement path as
`@query`/`@test`/`@check` (feature 18): one enforcement layer, immutable
rules apply, masking applies to output. OFF in every profile until the
project policy grants `code: { languages: [...], timeout: <ms> }`.

## Implementation Notes

**Accept additionally, the always-block carve-out**: engine-built runner
invocations (temp script file, never inline `-e`/`-c`) pass; `@query
"node -e ..."` is refused even when allowlisted (line 622-624, shared named
acceptance test with feature 10). Under Principle 4, `@code` is the
sanctioned channel for any file production a document needs; the write is
granted, visible, traced (line 390-391).

## Data Model

`@code` result: `{ _exit: number, _stdout: string, _stderr: string,
_duration: number, [label]?: <parsed JSON if stdout is JSON> }`.
`LIVESTAGE_CONTEXT`: `{ args, vars, doc }` (from feature 23).

## API/Interface

`@code language= src?= label?= timeout?= interpolate=false` (line 341,
378-392).

## Business Rules

1. Runner map comes from policy config; `javascript -> node`, `python ->
   python3`, `bash -> bash`, extensible (line 381-382).
2. Results: `_exit`, `_stdout`, `_stderr`, `_duration`; JSON stdout binds as
   structured data under `label` (line 382-384).
3. Context in via `LIVESTAGE_CONTEXT` (JSON) and stdin; `{{ }}` interpolation
   inside the body is opt-in via `interpolate=true` (line 384-386).
4. OFF in every profile until the project policy grants `code: { languages:
   [...], timeout: <ms> }`; an ungranted language fails at `validate` AND at
   runtime (line 388-390).
5. Engine-built runner invocations always execute a temp script file, never
   an inline `-e`/`-c` string; this is the single sanctioned exception to the
   inline-execution always-block (line 436-441).
6. A user's `@query "node -e ..."` remains always-blocked even if a pattern
   would allow it (line 439-441).

## Acceptance Criteria

- [ ] A granted Python `@code` block emits JSON that binds under `label`, and
      `{{ label.total }}` resolves correctly (Wave 4 demo-state, line
      615-617).
- [ ] Removing `python` from the policy fails the doc at `validate` time and
      at `render` runtime (line 617-618).
- [ ] Named acceptance test: an engine-built runner invocation passes while
      `@query "node -e ..."` is refused, proving the carve-out is precise
      (line 622-624).
- [ ] `LIVESTAGE_CONTEXT` and stdin correctly deliver args/vars/doc path into
      a granted script.
- [ ] `interpolate=true` correctly expands `{{ }}` inside the script body;
      the default (`interpolate=false`) does not.

## Dependencies

10-security-policy-core (shell enforcement, always-block carve-out),
18-compute-directives (shares exec plumbing lineage from the donor).

## Known Issues

None.
