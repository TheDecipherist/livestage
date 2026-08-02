---
id: 18-compute-directives
title: Compute Directives
type: COMPONENT
path: Directives / Compute
source_files: [src/parser/directives/hash.ts, src/parser/directives/query.ts, src/parser/directives/test.ts, src/parser/directives/check.ts, src/engine/exec-ops.ts]
status: complete
phase: all
last_synced: 2026-08-01
initiative: livestage
wave: livestage-wave-2
depends_on: [10-security-policy-core, 17-source-directives]
tags: [hash, query, test, check, shell-allowlist, structured-results]
known_issues:
  - "source_files corrected: src/engine/shell.ts removed (it is feature 22's pipe-stage shell helper, runShell, dispatched from a @pipe stage, not from @query/@test/@check; feature 22's doc now lists it and got its own Windows-stripping fix, see there). @hash's engine implementation (executeHash) lives in feature 17's read-ops.ts, and @query's (executeQuery) lives in feature 17's sources.ts; exec-ops.ts here owns only @test/@check. See 17's known_issues for the same cross-reference from its side."
  - "Fixed a real, host-project-visible bug while verifying acceptance criterion 3: the shipped strict profile was missing plain npm/npm run allow patterns (only pnpm variants existed), so @test / with no explicit command= (auto-detected via npm run <script>, always npm regardless of package manager) was blocked by default on this project itself. Fixed in defaultSecurityConfig() (config.ts); documented retroactively in 06-cr5-deny-by-default.md's known_issues since that SPEC (wave 1, already closed) is where the shipped profile's shape is specified."
satisfies_contracts:
  - from: 10-security-policy-core
    function: checkShellCommand
    when: always
    status: done
    verified_at: "tests/unit/engine/test-check.test.ts::blocked when command not in shell allowlist"
  - from: 10-security-policy-core
    function: checkDataPath
    when: always
    status: done
    verified_at: "tests/unit/engine/test-check.test.ts::auto-detected npm run <script> succeeds against the real shipped strict profile with no extra grants"
  - from: 10-security-policy-core
    function: checkWritePath
    when: "filesystem.write_enabled is true"
    status: done
    verified_at: "tests/unit/engine/test-check.test.ts::auto-detected npm run <script> succeeds against the real shipped strict profile with no extra grants"
---

# Compute Directives

## What to Build

`[verify]`, copy from
`~/projects/markdownai/packages/parser/src/directives/*` and
`packages/engine/src/*`. `@hash` (content hash), `@query` (allowlisted shell,
captured output), `@test`/`@check` (structured `_exit`, `_summary` from a
test/check command run through the same allowlist).

## Architecture

`@query`, `@test`, and `@check` all execute through the shell enforcement
path owned by feature 10 (`checkShellCommand`); this component is a
`satisfies_contracts` dependent, same as feature 17.

## Implementation Notes

`@query` is the general shell escape hatch: anything the allowlist grants
(`npm audit --json`, `docker ps --format json` once granted) is reachable.
`@test`/`@check` execute test runners through this SAME allowlist, so the
runner patterns (`npx vitest*`, `npm test*`, `tsc`, etc.) MUST ship in the
`strict` profile or these two directives are dead on arrival (line 424-428,
carried in feature 06's data model).

## Data Model

`@test`/`@check` structured result: `{ _exit: number, _summary: string, ...
raw stdout/stderr as needed }`. `@hash` result: content hash string (plus
`_exclude_line` handling when `exclude-line` is set).

## API/Interface

| Directive | Key attrs | Behavior |
|---|---|---|
| `@hash` | `path`, `exclude-line`, `label` | content hash |
| `@query` | `command` | allowlisted shell, captured output |
| `@test` / `@check` | `command` | structured `_exit`, `_summary` |

## Business Rules

1. `@query` executes only allowlisted shell commands (line 339, feature 06
   rule 1).
2. `@test`/`@check` execute through the same allowlist as `@query`; the
   runner patterns must be present in the shipped profile (line 424-428).
3. `@hash`'s `exclude-line` option excludes a matching line before hashing
   (e.g. to hash content ignoring a timestamp line).

## Acceptance Criteria

- [x] `@hash`, `@query`, `@test`, `@check` each render correctly against
      donor-copied fixture tests: `tests/unit/engine/hash.test.ts` (6),
      `tests/unit/engine/query-policy.test.ts` (3),
      `tests/unit/engine/test-check.test.ts` (12).
- [x] `@query` with a non-allowlisted command fails with a policy error:
      `query-policy.test.ts`, plus live-verified in wave 1's demo-state.
- [x] `@test`/`@check` against the shipped `strict` profile's allowlisted
      runner patterns succeed without additional grants. This was FALSE
      until fixed just now: the shipped profile was missing plain `npm`/
      `npm run` patterns (only `pnpm` variants existed), so auto-detected
      `@test`/`@check` (always `npm run <script>`) was blocked by default.
      Fixed in `defaultSecurityConfig()`; see Known Issues and
      `06-cr5-deny-by-default.md`.
- [x] `@hash exclude-line=...` produces a different hash than without it:
      `tests/unit/engine/hash.test.ts::exclude-line strips matching lines
      before hashing`.

## Dependencies

10-security-policy-core (shell enforcement), 17-source-directives (shares
read-ops patterns for file-based hashing).

## Known Issues

- `exec-ops.ts`'s `detectCommand` reads the project's `package.json`
  directly (`readFileSync`), bypassing `checkDataPath` entirely, on the
  grounds that the path is fixed (`resolve(ctx.cwd, 'package.json')`) and
  never influenced by document content. Narrow and non-interpolated, but
  worth a second look when feature 42 (Contract Scans) builds the real
  security matrix.
