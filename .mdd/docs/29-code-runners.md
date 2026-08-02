---
id: 29-code-runners
title: Code Runners
type: COMPONENT
path: Engine / Code Runners
source_files: [src/parser/directives/code.ts, src/engine/code-runners.ts, src/engine/engine.ts]
status: complete
phase: all
last_synced: 2026-08-02
initiative: livestage
wave: livestage-wave-4
depends_on: [10-security-policy-core, 18-compute-directives]
tags: [code, runners, sandboxed-execution, temp-script, granted-languages]
known_issues:
  - "No code security config section existed at all before this wave: SecurityJsonConfig had shell/http/db/filesystem/event but no code field, even though CR-5's own doc (feature 06, wave 1) already documented its shape. Added CodeSecurityConfig ({ languages, timeout, runners }), defaulting to languages: [] (off in every profile, business rule 4), threaded through loadSecurityConfig, EngineContext.security.codeConfig, and render.ts's buildSecurityConfig."
  - "The always-block carve-out is architectural, not a policy exception: @code never constructs a shell string at all (spawnSync(runnerCmd, [scriptPath], ...), argv-array form, shell:false implicitly), so it never reaches checkShellCommand or the SHELL_ALWAYS_BLOCK pattern list in the first place. A user's @query \"node -e ...\" still hits that immutable block because @query always builds a shell string. Live-verified: both behaviors hold simultaneously against the same granted policy."
  - "The validate-time ungranted-language check (business rule 4, shared with feature 27) did not exist: validate.ts had no security-config awareness at all before this wave. Added checkUngrantedCodeLanguages (liveness.ts) and wired loadSecurityConfig into validate.ts."
  - "@code could not be used as a pipe source at all (executeSource's switch had no 'code' case, would throw); found while verifying the wave-4 demo-state's '@render table shows its rows'. Added: only the self-closed src= form works as a pipe source (source | sink is one-line syntax; a multi-line @code...@code-end block cannot be followed by a pipe on a later line). A trailing empty line from the script's own trailing newline is dropped so it doesn't become a spurious blank table row. tests/unit/engine/code-runners.test.ts::can be used as a pipe source."
  - "RESOLVED (2026-08-02, post-initiative known_issues sweep): @code had no
    visible=/silent= suppression, unlike every source directive
    (@list/@read/@query/...), so pairing label= with a {{ label.field }}
    prose summary duplicated the same data (raw stdout, then the summary).
    Found live building the http-health example (feature 47) and flagged
    there as a deferred follow-up rather than fixed mid-example; fixed
    here, in engine.ts's 'code' case, the same convention the shared
    source-directive dispatch already uses. tests/unit/engine/code-runners.test.ts's
    three visible=/silent= tests."
satisfies_contracts:
  - from: 10-security-policy-core
    function: checkDataPath
    when: always
    status: done
    verified_at: "tests/unit/engine/code-runners.test.ts::src= resolves through the same data-jail check every source directive uses (checkDataPath)"
  - from: 10-security-policy-core
    function: checkShellCommand
    when: always
    status: done
    verified_at: "tests/unit/engine/code-runners.test.ts::the always-block carve-out: an engine-built invocation runs even though a literal node -e @query stays blocked"
  - from: 10-security-policy-core
    function: checkWritePath
    when: "filesystem.write_enabled is true"
    status: done
    verified_at: "src/engine/code-runners.ts:65"
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

- [x] A granted Python `@code` block emits JSON that binds under `label`, and
      `{{ label.total }}` resolves correctly, and its rows pipe into
      `@render type="table"`. Live-verified with a real Python subprocess
      (Wave 4 demo-state, both the label-binding and the table-render
      halves); JS-runner equivalents in
      `tests/unit/engine/code-runners.test.ts`.
- [x] Removing `python` from the policy fails the doc at `validate` time and
      at `render` runtime. Live-verified both paths.
- [x] Named acceptance test: an engine-built runner invocation passes while
      `@query "node -e ..."` is refused. Live-verified and
      `code-runners.test.ts::the always-block carve-out`.
- [x] `LIVESTAGE_CONTEXT` correctly delivers args/vars/doc into a granted
      script: `code-runners.test.ts::LIVESTAGE_CONTEXT delivers
      args/vars/doc`. Delivered via env var and stdin (both, per the spec's
      "Context in via LIVESTAGE_CONTEXT and stdin").
- [x] `interpolate=true` correctly expands `{{ }}` inside the script body;
      the default (`interpolate=false`) does not.

## Dependencies

10-security-policy-core (shell enforcement, always-block carve-out),
18-compute-directives (shares exec plumbing lineage from the donor).

## Known Issues

See the frontmatter `known_issues` above: the new `code` security config
section, the architectural (not policy-based) carve-out, and the new
validate-time grant check.
