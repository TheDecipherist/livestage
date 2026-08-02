---
id: 19-composition-directives
title: Composition Directives
type: COMPONENT
path: Directives / Composition
source_files: [src/parser/directives/set.ts, src/parser/directives/if.ts, src/parser/directives/foreach.ts, src/parser/directives/switch.ts, src/parser/directives/define.ts, src/parser/directives/call.ts, src/parser/directives/include.ts, src/parser/directives/import.ts, src/parser/directives/template.ts, src/parser/directives/data.ts, src/engine/engine-interpolate.ts, src/engine/engine-include.ts, src/engine/engine-template.ts, src/engine/macros.ts]
status: complete
phase: all
last_synced: 2026-08-01
initiative: livestage
wave: livestage-wave-2
depends_on: [09-grammar-parser, 17-source-directives]
tags: [interpolation, control-flow, macros, include, import, template, scoping]
known_issues: []
---

# Composition Directives

## What to Build

`[verify]`, copy from
`~/projects/markdownai/packages/parser/src/directives/*` and
`packages/engine/src/*`. Interpolation and sandbox builtins, `@set`, `@if`,
`@foreach`, `@switch` (control flow), `@define`/`@call` (macros),
`@include`/`@import` (inline/import), `@template`/`@data` (bound-data
partials).

## Architecture

Everything that resolves `{{ }}` expressions and controls what parts of a
document render lives here. `@include`/`@import`/`@template` resolve
`.stage` files relative to the including document, subject to filesystem
policy (feature 10, via feature 17's resolution path).

## Implementation Notes

`@set` scopes to a single render pass (Principle 3, line 93-94; this is also
part of CR-4's acceptance test, feature 05). The `allowed()` sandbox builtin
(seeded) performs validated dispatch, e.g. `@if {{ allowed(arg0, "list",
"sync") }}` (line 455-456, owned functionally by feature 23's args wiring but
the builtin itself lives in this component's interpolation layer).

The donor's `@template`/`@data` partial interaction with `@foreach` scoping is
covered by copied tests, but needs early verification against the `.stage`
re-extension of fixtures (Known gaps, line 859-862).

## Data Model

N/A (control-flow and interpolation state, not a persisted data model).

## API/Interface

| Directive | Key attrs | Behavior |
|---|---|---|
| `@set` | `name`, `value` | single-render scope |
| `@if`/`@foreach`/`@switch` | `expr` / `x in {{ }}` | control flow |
| `@define`/`@call` | `name` | macros |
| `@include`/`@import` | `path` | inline / import macros |
| `@template`/`@data` | `data=`, `as=` | bound-data partials |

## Business Rules

1. `@set` scopes to a single render pass; no leakage across invocations
   (line 93-94).
2. `@include`/`@import`/`@template` resolve `.stage` files relative to the
   including document, subject to filesystem policy (line 322-324).
3. The `allowed()` sandbox builtin performs validated dispatch against a
   fixed list of allowed values (line 455-456).

## Acceptance Criteria

- [x] `@set`, `@if`, `@foreach`, `@switch`, `@define`/`@call`,
      `@include`/`@import`, `@template`/`@data` each render correctly
      against donor-copied fixture tests: `foreach.test.ts` (9),
      `template-foreach.test.ts` (7), `set.test.ts` (7),
      `parser/switch.test.ts` (10), `parser/define-body.test.ts` (4),
      `parser/parser-directives.test.ts`, plus the wider parser suite.
- [x] Two sequential renders of the same document do not see each other's
      `@set` values: `tests/unit/engine/statelessness.test.ts` (shared with
      feature 05, CR-4).
- [x] `@template`/`@data` partials interact correctly with `@foreach` scoping
      on `.stage`-re-extended fixtures. Live-verified with real `.stage`
      files (not the `.md` fixtures the unit tests use): a `@foreach` over
      `@list`'s filesystem-mode items correctly binds each iteration's item
      (a file path, per `@list`'s documented filesystem behavior) to the
      `@template ... as=user` alias inside the partial. Closes the known
      gap; no `.stage`-vs-`.md` divergence found.
- [x] `allowed()` correctly validates and rejects out-of-list dispatch
      values: `tests/unit/engine/allowed.test.ts` (18 tests).

## Dependencies

09-grammar-parser, 17-source-directives (include/import resolution shares
the source-resolution path).

## Known Issues

Audit resolved: `read_section`, `parse_brief`, and `extract_paths` are
generic text utilities (a markdown section extractor, a `**Label.**` block
parser, a backtick-path extractor) with no dependency on the removed
AI-consumer directive syntax; kept. They had zero test coverage before this
wave, added in `tests/unit/engine/sandbox-brief-builtins.test.ts` (4 tests).
They are currently used by MDD's own build flow to seed feature docs from
wave briefs, not by any `.stage` document feature.
