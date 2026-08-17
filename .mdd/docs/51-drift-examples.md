---
id: 51-drift-examples
title: Drift Examples
type: COMPONENT
path: Examples / Drift
source_files: [examples/drift/env-drift/env-drift.stage,
  examples/drift/env-drift/.livestage/policy.json,
  examples/drift/env-drift/sample-project/src/config.ts,
  examples/drift/env-drift/sample-project/.env.example,
  examples/drift/scripts-reference/scripts-reference.stage,
  examples/drift/scripts-reference/sample-project/package.json,
  examples/drift/test-coverage-map/test-coverage-map.stage,
  examples/drift/test-coverage-map/sample-project/src/add.ts,
  examples/drift/test-coverage-map/sample-project/src/subtract.ts,
  examples/drift/test-coverage-map/sample-project/src/multiply.ts,
  examples/drift/test-coverage-map/sample-project/tests/add.test.ts,
  examples/drift/test-coverage-map/sample-project/tests/subtract.test.ts,
  examples/drift/todo-debt/todo-debt.stage,
  examples/drift/todo-debt/.livestage/policy.json,
  examples/drift/todo-debt/sample-project/src/payments.ts]
test_files: [tests/e2e/drift-examples.test.ts]
status: complete
phase: all
last_synced: 2026-08-17
initiative: livestage
depends_on: [17-source-directives, 18-compute-directives, 22-pipe]
tags: [examples, drift, env-vars, scripts, test-coverage, todo-debt, onboarding]
known_issues:
  - "The env-drift example's .env.example read goes through @query
    (`cat sample-project/.env.example`, an exact-string shell grant)
    rather than @read: @read's filesystem policy blocks any `.env*`
    path unconditionally, an immutable rule (real .env files hold
    secrets), and that block applies even to a placeholder-only
    .env.example. Confirmed live during this build (the first draft
    used @read and got a SECURITY_ALERT + empty output). Documented
    inline in the example's own prose as a deliberate, narrow
    workaround, not a gap to hide."
---

# Drift Examples

## What to Build

`[new]`. Four worked examples under `examples/drift/`, each replacing a
specific kind of hand-maintained doc/config that silently diverges from
the code that should govern it: `.env.example` vs actual `process.env`
usage, a README's hand-typed "how to run this" table vs `package.json`'s
real `scripts`, a stale "known coverage gaps" doc vs which source files
actually have a matching test file, and a hand-kept "known issues" list
vs a live `TODO`/`FIXME`/`HACK` grep. Each ships with its own minimal
`sample-project/` fixture and, where shell access is genuinely needed,
the exact policy grant required, following the same pattern as
`examples/agent-briefs/` and `examples/database/`.

## Architecture

Each example is a self-contained directory: one `.stage` file, a small
`sample-project/` fixture with a deliberately planted, realistic gap
(a missing env var, a renamed script, an untested file, a live TODO),
and (for `env-drift`/`todo-debt`) a `.livestage/policy.json` granting
only the exact shell command strings the example needs, never a
wildcard. `scripts-reference` and `test-coverage-map` need no policy
grant at all, both are pure `@list`/filesystem-policy reads, proof (same
point `onboarding-brief.stage` already makes) that a whole class of
"inspect this project" work never touches the shell.

## Data Model

- `env-drift`: `@query "grep -rn process.env. sample-project/src"` lists
  every `process.env.X` reference with file:line; a second `@query "cat
  sample-project/.env.example"` reads the example file's raw content.
  Both rendered side by side; the reader (or an agent) spots the gap by
  comparing the two short lists, the same way the existing
  `codebase-health.stage`/`onboarding-brief.stage` examples favor plain
  juxtaposition over a computed diff.
- `scripts-reference`: `@list "sample-project/package.json" path="scripts"
  mode="entries"` piped into `@render type="table" columns="script,command"`,
  using `listJson`'s existing `mode="entries"` support (`key\tvalue` per
  line, feature 17) with no new engine code.
- `test-coverage-map`: two `@list ... match="*.ts"` calls, one over
  `src/`, one over `tests/`, rendered as two lists.
- `todo-debt`: `@query "grep -rnE 'TODO|FIXME|HACK' sample-project/src"`,
  file:line output, same shape as `env-drift`'s grep.

## API/Interface

N/A new directive; every example composes existing directives
(`@query`, `@list`, `@render`) exactly as documented in features 17, 18,
20, and 22.

## Business Rules

1. Every shell-backed example (`env-drift`, `todo-debt`) grants only
   exact command strings in `allow_patterns`, never a wildcard prefix,
   consistent with `codebase-health.stage`'s own documented caution
   (a wildcard like `"grep *"` would permit chaining after the prefix;
   an exact string cannot, regardless of B1's fix elsewhere making
   wildcards safe too, exact strings remain the more legible grant for
   a worked example).
2. `scripts-reference` and `test-coverage-map` ship no `.livestage/`
   policy directory at all: they run under the default (fully denied)
   policy with zero grants, proving the filesystem-only directive tier
   needs nothing else.
3. Every example's fixture data plants a real, visible gap (a
   documented-but-unread var, an undocumented-but-read var, a source
   file with no test, three TODO-class comments): the rendered output
   is the demonstration, not just syntax coverage.

## Acceptance Criteria

- [x] `env-drift.stage` renders both the code-referenced vars and the
      `.env.example` content, live. `tests/e2e/drift-examples.test.ts`.
- [x] `scripts-reference.stage` renders `package.json`'s scripts as a
      table with zero policy grant. `tests/e2e/drift-examples.test.ts`.
- [x] `test-coverage-map.stage` renders both file lists, the untested
      file visibly absent from the test list, zero policy grant.
      `tests/e2e/drift-examples.test.ts`.
- [x] `todo-debt.stage` renders a file:line inventory of all three
      planted markers. `tests/e2e/drift-examples.test.ts`.
- [x] Every shell-backed example's `allow_patterns` contains only
      exact-string entries, no wildcard. `tests/e2e/drift-examples.test.ts`.

## Dependencies

17-source-directives (`@list`/`@read`), 18-compute-directives (`@query`),
22-pipe (`@render` piping).

## Known Issues

See frontmatter `known_issues`.
