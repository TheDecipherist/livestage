---
id: 28-ci-mode
title: CI Mode
type: COMPONENT
path: CLI / CI Mode
source_files: [src/cli/commands/validate.ts, src/cli/commands/assert.ts]
status: planned
phase: idle
last_synced: 2026-08-01
initiative: livestage
wave: livestage-wave-3
depends_on: [26-assert-operators, 13-cli-router]
tags: [ci, exit-codes, bare-checkout, assert-command, validate-command]
known_issues: []
---

# CI Mode

## What to Build

`[new]`. The `validate` and `assert` CLI commands' exit-code semantics on a
bare checkout, wiring feature 26's operators and feature 27's liveness checks
into the exit codes the router (feature 13) already defines.

## Architecture

CI invokes the same verbs as every test (Testing Strategy, line 783), so
parity between an interactive session and CI is by construction, not a
separate mode. This component is what makes `livestage assert` usable as a
CI gate against a fixture repo containing only the bundle.

## Implementation Notes

The `.stage` fixture re-extension from the seed (Wave 0 step 4, spec line
203-204) must be verified early since `assert`/`validate` are the first
commands that walk a whole fixture glob rather than a single named file
(shared Known-gaps concern with feature 19).

## Data Model

N/A.

## API/Interface

- `validate <file|glob>`: exit 0 all valid; exit 1 any invalid; exit 2 usage.
- `assert <file|glob>`: exit 0 all assertions pass; exit 1 any fail
  (including zero-match fails); exit 2 document invalid.

## Business Rules

1. `assert` exits 1 in a CI fixture repo with only the bundle present when
   any assertion fails, including zero-match fails (line 607, 521).
2. `validate` exits 1 on any invalid document per feature 27's rules; exit 2
   is reserved for usage/parse errors, distinct from validation failures.

## Acceptance Criteria

- [ ] `livestage assert` against a CI fixture repo (only `dist/livestage.js`
      present, no install step) exits 1 when an assertion fails.
- [ ] `livestage validate` against a glob of fixture docs exits 0 only when
      every doc is valid, 1 when any is invalid, 2 on a malformed glob/usage
      error.
- [ ] Exit codes match exactly across a local run and a CI run of the same
      fixture (parity by construction).

## Dependencies

26-assert-operators (assert command wraps operator results into exit codes),
13-cli-router (verb routing and base exit-code plumbing).

## Known Issues

None.
