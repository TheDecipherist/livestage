---
id: 18-compute-directives
title: Compute Directives
type: COMPONENT
path: Directives / Compute
source_files: [src/parser/directives/hash.ts, src/parser/directives/query.ts, src/parser/directives/test.ts, src/parser/directives/check.ts, src/engine/exec-ops.ts, src/engine/shell.ts]
status: planned
phase: idle
last_synced: 2026-08-01
initiative: livestage
wave: livestage-wave-2
depends_on: [10-security-policy-core, 17-source-directives]
tags: [hash, query, test, check, shell-allowlist, structured-results]
known_issues: []
satisfies_contracts:
  - from: 10-security-policy-core
    function: enforcePolicy
    when: always
    status: pending
    verified_at: ""
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
path owned by feature 10; this component is a `satisfies_contracts`
dependent of `enforcePolicy`, same as feature 17.

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

- [ ] `@hash`, `@query`, `@test`, `@check` each render correctly against
      donor-copied fixture tests.
- [ ] `@query` with a non-allowlisted command fails with a policy error (Wave
      1 demo-state item, line 570, verified here for the directive itself).
- [ ] `@test`/`@check` against the shipped `strict` profile's allowlisted
      runner patterns (`npx vitest*`, `npm test*`, `tsc`, ...) succeed
      without additional grants.
- [ ] `@hash exclude-line=...` produces a different hash than without it on a
      fixture with a variable line (e.g. a timestamp).

## Dependencies

10-security-policy-core (shell enforcement), 17-source-directives (shares
read-ops patterns for file-based hashing).

## Known Issues

None.
