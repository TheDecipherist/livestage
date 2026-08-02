---
id: 26-assert-operators
title: Assert Operators
type: COMPONENT
path: Directives / Assert Operators
source_files: [src/parser/directives/assert.ts, src/engine/assert/operators.ts, src/engine/assert/results.ts]
status: complete
phase: all
last_synced: 2026-08-02
initiative: livestage
wave: livestage-wave-3
depends_on: [17-source-directives, 18-compute-directives, 19-composition-directives]
tags: [assert, operators, vacuity, match-count, file-exists, contains, json-key]
known_issues:
  - "target is a single glob string (e.g. target=\"src/**/*.ts\"), resolved through the same checkDataPath jail every source directive uses (resolveDataPath, exported from sources.ts for reuse). Found and fixed a real, pre-existing bug in the shared globToRegex utility while building target resolution: ** was treated as a plain inline .* via blind string replacement, requiring a literal / immediately before the match, so **/*.ts matched sub/a.ts but silently excluded the top-level a.ts. This affected every existing caller (@list, @count), not just @assert. Fixed to the standard convention (a ** segment matches zero or more directories, including none); tests/unit/engine/glob-to-regex.test.ts."
  - "json-key's key path supports dot/bracket addressing (a.b[0].c) for JSON targets, but only a top-level field for frontmatter (.md) targets, matching feature 17's read-frontmatter scope limitation (reads ONE top-level field per call). Deeper frontmatter key paths are out of scope."
  - "@assert renders an inline pass/fail line (formatAssertResult) where the directive sat, and pushes its AssertResult onto ctx.assertResults when the caller opts in by passing an array (undefined by default, render() itself never reads it). This is how feature 28's assert CLI command collects a document's results without re-parsing rendered markdown."
primitives:
  - name: "@assert"
    kind: directive
---

# Assert Operators

## What to Build

`[new]`, no donor source. The `@assert` directive and its six operators:
`file-exists`, `contains`, `some-contains`, `contains-if-present`, `absent`,
`json-key`. Every result carries `{ operator, target, matches, passed,
vacuous }`.

## Interface Overview

`@assert` is a pass/fail check against real files: does this path exist,
does it contain a pattern, does a JSON key have the value you expect. It's
the building block `livestage validate` and `livestage assert` use to gate
a document (or a whole project) in CI, so a broken assumption fails the
build instead of silently shipping.

| Name | What it does |
|---|---|
| `@assert` | Checks a file (or set of files) against a condition and reports pass or fail. |

### @assert

Runs one check against `target` (a file path or glob) using the chosen
`operator`, and renders an inline pass/fail line.

```stage
@assert operator="file-exists" target="package.json" /
```

| Parameter | Values | Description |
|---|---|---|
| `operator` | `file-exists` \| `contains` \| `some-contains` \| `contains-if-present` \| `absent` \| `json-key` | Which check to run |
| `target` | glob | The file(s) to check |
| `pattern` | text | Content to look for, for `contains`/`some-contains`/`contains-if-present`/`absent` |
| `key` | dot/bracket path | The key to look up, for `json-key` |
| `equals` | value | Require the key to equal this value, for `json-key` |
| `label` | name | Capture the structured result (`operator`, `matches`, `passed`, `vacuous`) into a variable |

Only `absent` and `contains-if-present` are allowed to pass when nothing
matches (a missing target is exactly what they're checking for); every
other operator fails on zero matches, so a check can never quietly pass
because its target went missing by accident.

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

- [x] An assertion doc against a fixture tree goes green for each operator
      against a matching fixture. Live-verified for all six operators;
      `tests/unit/engine/assert-operators.test.ts` (23 tests).
- [x] Deleting the target files flips `contains`/`some-contains`/
      `file-exists`/`json-key` to FAIL, never a vacuous pass:
      `assert-operators.test.ts::deleting the target file flips a passing
      assertion to FAIL`.
- [x] `absent` against a target with zero matches passes and is flagged
      `vacuous: true`.
- [x] `contains-if-present` against a missing target passes without a
      `vacuous` flag.
- [x] Every result object matches the `{ operator, target, matches, passed,
      vacuous }` shape.

## Dependencies

17-source-directives, 18-compute-directives (target resolution and file
reads), 19-composition-directives (interpolation inside assert attributes).

## Known Issues

See the frontmatter `known_issues` above: the `globToRegex` fix (shared,
affects `@list`/`@count` too), `json-key`'s frontmatter scope limit, and
the `ctx.assertResults` collection mechanism for feature 28.
