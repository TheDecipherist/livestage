---
id: 28-ci-mode
title: CI Mode
type: COMPONENT
path: CLI / CI Mode
source_files: [src/cli/commands/validate.ts, src/cli/commands/assert.ts]
status: complete
phase: all
last_synced: 2026-08-02
initiative: livestage
wave: livestage-wave-3
depends_on: [26-assert-operators, 13-cli-router]
tags: [ci, exit-codes, bare-checkout, assert-command, validate-command]
known_issues:
  - "New: assert <file|glob> was not registered in cli.ts at all before this wave (feature 13's known_issues had already flagged it as deferred). Added, plus glob support for both assert and validate (validate previously accepted a single file only) via a new shared expandFileGlob (src/cli/glob-expand.ts), reusing the same globToRegex/walkDir glob resolution @list and @assert use."
  - "assert's document-invalid check (exit 2) reuses runValidate's full semantic pass (undefined @call macro, missing @include target, inert @assert doc, args with no fallback, ...), not just a parse-error check; an early version only caught parse errors and let a document with an undefined macro through as if it were a normal assertion failure. Fixed and tested."
  - "The bundle-only bare-checkout scenario (acceptance criterion 1 as literally worded: a CI fixture repo with only dist/livestage.js present, no install step) is not verifiable yet: the single-file esbuild bundle is feature 41 (wave 6), not built. Verified instead against a normal fixture repo; re-verify against the real bundle when feature 41 lands."
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

- [!] `livestage assert` exits 1 when an assertion fails. Live-verified and
      `tests/unit/cli/assert.test.ts` / `cli-router.test.ts` (real binary).
      Not yet verified against the literal bundle-only bare checkout, see
      Known Issues.
- [x] `livestage validate` against a glob of fixture docs exits 0 only when
      every doc is valid, 1 when any is invalid, 2 when the glob matches
      nothing. Live-verified and tested (real binary).
- [x] Exit codes match across a local run and a CI run of the same fixture:
      by construction, `assert`/`validate` are plain CLI commands with no
      CI-specific branch; the same binary, same code path, same exit codes
      either way.

## Dependencies

26-assert-operators (assert command wraps operator results into exit codes),
13-cli-router (verb routing and base exit-code plumbing).

## Known Issues

See the frontmatter `known_issues` above: `assert` was never registered
before this wave, glob support added to both commands, and the bundle-only
bare-checkout scenario deferred to feature 41.
