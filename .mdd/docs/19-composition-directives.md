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
known_issues:
  - "[gap] test_files unknown, tests undiscovered. This doc predates the
    test_files completion gate; real coverage almost certainly exists
    (tests/unit/engine/{set,switch,foreach,data,template,template-foreach,
    template-security,include-dynamic-path,include-import-skill-dir}.test.ts
    and others reference these source files) but a precise per-file mapping
    was not run here, this doc was only touched to record the RCE gap below
    during an unrelated build (read-body-directive). Needs its own
    mdd-frontmatter-discovery pass."
  - "[gap] CRITICAL, RCE via @foreach body substitution: substituteNode's
    'markdown' case (src/engine/macros.ts) text-substitutes a loop item's
    VALUE into the body then re-derives interpolation spans with
    scanInterpolations() on the result. If the item's value (e.g. a line
    read from a file via @read, @list, @query, or @read-body/read_body)
    itself contains literal {{ }} syntax, that text is picked up as a NEW
    real expression and evaluated at render time. The vm sandbox exposes
    host-realm objects, so file content like
    '{{ this.constructor.constructor(\"return process\")() }}' escapes to
    the real Node process, same vulnerability class and same escape
    technique as the where= RCE fixed in feature 36
    (frontmatter-query), just a different, older sink. Verified live via
    the pre-existing @read source (not read-body): @foreach x in @read
    'evil.md' / ITEM {{ x }} / @foreach-end printed process.platform, no
    read-body code involved. Root cause: subStr()'s regex substitution
    treats data (the item value) and template (the body's own {{ }}
    spans) as the same trust level; the rescan should only re-derive
    spans that existed in the ORIGINAL template text, not spans
    introduced by substituted data. Found during the read-body-directive
    build's Phase 7 security review (2026-08-03) because that build added
    read_body/@read-body as one more @foreach-reachable source; the sink
    itself and its exploitability predate that build entirely and are not
    caused by it. Needs a dedicated fix build (redesign macros.ts's
    substitution to bind loop values as sandbox data rather than
    text-splice + rescan, mirroring the where= fix's arg-binding
    approach), not a bundled fix inside an unrelated feature."
primitives:
  - name: "@set"
    kind: directive
  - name: "@if"
    kind: directive
  - name: "@foreach"
    kind: directive
  - name: "@switch"
    kind: directive
  - name: "@define"
    kind: directive
  - name: "@call"
    kind: directive
  - name: "@include"
    kind: directive
  - name: "@import"
    kind: directive
  - name: "@template"
    kind: directive
  - name: "@data"
    kind: directive
---

# Composition Directives

## What to Build

`[verify]`, copy from
`~/projects/markdownai/packages/parser/src/directives/*` and
`packages/engine/src/*`. Interpolation and sandbox builtins, `@set`, `@if`,
`@foreach`, `@switch` (control flow), `@define`/`@call` (macros),
`@include`/`@import` (inline/import), `@template`/`@data` (bound-data
partials).

## Interface Overview

These ten directives are how a `.stage` document controls what renders and
reuses logic instead of just listing data top to bottom: branching on a
condition, looping over a list, defining a reusable snippet once and
calling it from several places, or pulling in another `.stage` file. Reach
for these once a document needs to do more than read one thing and print
it.

| Name | What it does |
|---|---|
| `@set` | Assigns a variable for later `{{ }}` use. |
| `@if` | Branches on a condition, rendering its body only when true. |
| `@foreach` | Loops over a list or a query's result. |
| `@switch` | Branches on an expression across multiple cases. |
| `@define` | Defines a reusable, parameterized block (a macro). |
| `@call` | Invokes a macro defined with `@define`. |
| `@include` | Renders another `.stage` file's content inline. |
| `@import` | Pulls in another `.stage` file's macros/env fallbacks without rendering it. |
| `@template` | Renders a reusable partial file against a bound data value. |
| `@data` | Defines a small structured data value inline, for `@template` or `{{ }}` use. |

### @set

Assigns a variable, scoped to the current render only; nothing set here
leaks into a later render of the same document.

```stage
@set count = @count "src" match="*.ts" /
{{ count }} TypeScript files.
```

### @if

Branches on a condition, rendering its body only when the condition is
true. Closed with `@if-end`.

```stage
@set count = @count "src" match="*.ts" /
@if count > 50
This is a big module.
@if-end
```

### @foreach

Loops over a list, or a query's result rows, binding each item to a
variable for the loop body. Closed with `@foreach-end`.

```stage
@foreach file in @list "src" match="*.ts" /
- {{ file }}
@foreach-end
```

### @switch

Branches on an expression across multiple `@case` values, with an optional
`@default` when nothing matches. Closed with `@switch-end`.

```stage
@switch status
@case "active"
Active.
@case "complete"
Done.
@default
Unknown.
@switch-end
```

### @define

Defines a reusable, parameterized block of markdown and directives (a
macro), invoked later with `@call`. Closed with `@define-end`.

```stage
@define greet(name)
Hello, {{ name }}!
@define-end
```

| Parameter | Values | Description |
|---|---|---|
| (positional) | `name(param1, param2)` | The macro's name and parameter list |
| `local` | flag | Scope the macro to this file only, not shared with files that `@include` it |

### @call

Invokes a macro previously defined with `@define`, passing arguments
either positionally or as `key=value` pairs.

```stage
@call greet("world")
```

| Parameter | Values | Description |
|---|---|---|
| (positional) | `name(arg1, arg2)` or `name key=value` | The macro to invoke and its arguments |

### @include

Renders another `.stage` file's content inline, as if it were pasted at
this point in the document. Paths are confined to the project, no
absolute paths and no `..` traversal.

```stage
@include "partials/header.stage" /
```

| Parameter | Values | Description |
|---|---|---|
| (positional) or `path` | file path | The `.stage` file to render inline |
| `if` | expression | Only include when the expression is true |
| `local` | flag | Don't share this file's own macros back out |

### @import

Pulls in another `.stage` file's macro and environment-fallback
definitions without rendering any of its content, useful for sharing
`@define`d macros across files.

```stage
@import "partials/macros.stage" /
```

| Parameter | Values | Description |
|---|---|---|
| (positional) or `path` | file path | The `.stage` file to import definitions from |
| `if` | expression | Only import when the expression is true |
| `local` | flag | Don't re-export this file's own macros |

### @template

Renders a reusable partial file against a bound data value, useful for
rendering the same layout once per item in a `@foreach`.

```stage
@foreach user in @list "data/users.json" /
@template "partials/user-card.stage" data="{{ user }}" as="user" /
@foreach-end
```

| Parameter | Values | Description |
|---|---|---|
| (positional) or `path` | file path | The partial `.stage` file to render |
| `data` | expression | The value to bind into the partial |
| `as` | identifier (default `data`) | The variable name the partial sees |
| `if` | expression | Only render when the expression is true |

### @data

Defines a small structured data value inline, one `key = expression` (or
`...expression` to spread another value's fields) per line, for use with
`@template` or `{{ }}` interpolation elsewhere in the document.

```stage
@data user
  name = "Ada"
  role = "engineer"
@data-end
{{ user.name }}, {{ user.role }}
```

| Parameter | Values | Description |
|---|---|---|
| (positional) or `name` | identifier | The variable name this data is bound to |

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
