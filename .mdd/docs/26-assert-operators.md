---
id: 26-assert-operators
title: Assert Operators
type: COMPONENT
path: Directives / Assert Operators
source_files: [src/parser/directives/assert.ts, src/engine/assert/operators.ts, src/engine/assert/results.ts]
status: planned
phase: idle
last_synced: 2026-08-01
initiative: livestage
wave: livestage-wave-3
depends_on: [17-source-directives, 18-compute-directives, 19-composition-directives]
tags: [assert, operators, vacuity, match-count, file-exists, contains, json-key]
known_issues: []
---

# Assert Operators

## What to Build

`[new]`, no donor source. The `@assert` directive and its six operators:
`file-exists`, `contains`, `some-contains`, `contains-if-present`, `absent`,
`json-key`. Every result carries `{ operator, target, matches, passed,
vacuous }`.

## Architecture

Consumes source/compute directive resolution (features 17, 18) to locate and
read `target` files, and composition (feature 19) for `{{ }}` interpolation
inside `pattern`/`key` attributes.

## Implementation Notes

Vacuity semantics are the load-bearing design point (Principle 7, line
113-115): "Checks can fail but never lie. Contains-class assertions FAIL on
zero matches; only `absent` may pass vacuously; every result carries its
match count; dead specs die at validate time, not in production." A double-
escaped regex (compiling to a literal backslash) is a validate-time warning
owned by feature 27 (Assert Liveness), not this component, but the operator
implementation must expose enough information (the compiled pattern) for
that check to run.

## Data Model

Assert result: `{ operator: string, target: string, matches: number, passed:
boolean, vacuous: boolean }` (line 374).

## API/Interface

`@assert` (self-closing), attrs: `operator`, `target`, plus `pattern`/`key`/
`equals=` depending on operator (line 342).

| Operator | Passes when | Zero-match behavior |
|---|---|---|
| `file-exists` | every path matching `target` exists | FAIL |
| `contains` | every matched file contains `pattern` | FAIL |
| `some-contains` | at least one matched file contains `pattern` | FAIL |
| `contains-if-present` | every matched file that exists contains `pattern` | pass (explicitly conditional) |
| `absent` | no matched file contains `pattern` | pass (vacuous pass permitted, flagged `vacuous: true`) |
| `json-key` | key path present (optionally `equals=`) in matched JSON/frontmatter | FAIL |

## Business Rules

1. `file-exists`, `contains`, `some-contains`, `json-key` FAIL on zero
   matches (line 367-372, table).
2. `contains-if-present` passes vacuously and explicitly (not flagged) when
   nothing matches (line 370).
3. `absent` is the only operator permitted to pass vacuously, and it is
   flagged `vacuous: true` when it does (line 371).
4. Every result carries `{ operator, target, matches, passed, vacuous }`
   (line 374).

## Acceptance Criteria

- [ ] An assertion doc against a fixture tree goes green for each operator
      against a matching fixture.
- [ ] Deleting the target files flips `contains`/`some-contains`/
      `file-exists`/`json-key` to FAIL, never a vacuous pass.
- [ ] `absent` against a target with zero matches passes and is flagged
      `vacuous: true`.
- [ ] `contains-if-present` against a missing target passes without a
      `vacuous` flag.
- [ ] Every result object matches the `{ operator, target, matches, passed,
      vacuous }` shape.

## Dependencies

17-source-directives, 18-compute-directives (target resolution and file
reads), 19-composition-directives (interpolation inside assert attributes).

## Known Issues

None.
