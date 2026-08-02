---
id: 27-assert-liveness
title: Assert Liveness
type: COMPONENT
path: Directives / Assert Liveness
source_files: [src/engine/assert/liveness.ts]
status: planned
phase: idle
last_synced: 2026-08-01
initiative: livestage
wave: livestage-wave-3
depends_on: [26-assert-operators]
tags: [validate, liveness, inert-doc, regex-lint, args-fallback-rule]
known_issues: []
---

# Assert Liveness

## What to Build

`[new]`. Validate-time glob liveness checking, double-escaped-regex linting,
inert-doc refusal, and the args-without-fallback rule. This is what makes
`livestage validate` more than a syntax check.

## Architecture

Runs at `validate` time (owned by feature 13's CLI plumbing, but the
liveness/inert/regex checks themselves are this component), consuming
feature 26's assert operators and feature 23's args model.

## Implementation Notes

"Directives outside the registry fail as unknown directives; no special-case
handling exists" (line 611) - this component does not add exceptions for
otherwise-valid-looking but excluded directives; feature 09 (Grammar Parser)
already rejects those at parse time, so this component's inert-doc check
only concerns documents that parse cleanly but whose assertions can never
possibly pass or fail meaningfully.

## Data Model

N/A.

## API/Interface

Consumed by `livestage validate <file|glob>` (line 520): exit 0 all valid,
exit 1 any invalid (including inert assertions, removed directives, args
without fallback, ungranted `@code` language), exit 2 usage/parse error.

## Business Rules

1. `validate` refuses a document whose every assertion is inert (line 374-375).
2. `validate` warns on suspicious regexes (double-escape compiling to a
   literal backslash) (line 375-376).
3. `validate` fails a document that dereferences args without an absent-args
   fallback (line 459-460, shared rule with feature 23).
4. `validate` fails a document using an ungranted `@code` language (line 520,
   shared rule with feature 29).

## Acceptance Criteria

- [ ] `validate` on an all-inert assertion doc (every `@assert` target
      guaranteed to never match anything meaningful) fails.
- [ ] `validate` on a doc with a double-escaped regex pattern (e.g.
      `\\\\d+` where `\\d+` was intended) emits a warning.
- [ ] `validate` on a doc that dereferences `{{ args }}`/`{{ arg0 }}` without
      an `@if`/fallback guard fails.
- [ ] `validate` on a doc using `@code language="ruby"` when `ruby` is not in
      the policy's granted languages fails.

## Dependencies

26-assert-operators.

## Known Issues

None.
