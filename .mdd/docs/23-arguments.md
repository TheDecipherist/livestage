---
id: 23-arguments
title: Arguments (F-ARGS)
type: COMPONENT
path: Engine / Args
source_files: [src/engine/args.ts]
status: planned
phase: idle
last_synced: 2026-08-01
initiative: livestage
wave: livestage-wave-2
depends_on: [19-composition-directives]
tags: [args, vars, allowed-builtin, livestage-context, absent-args-fallback]
known_issues: []
---

# Arguments (F-ARGS)

## What to Build

`[new; donor skill-context-variables]`, lift from the donor's skill-context-
variables machinery. `livestage render doc.stage --args "<raw user prompt>"
--var k=v` exposes `{{ args }}`, tokenized `{{ arg0 }}..{{ argN }}`,
`{{ vars.k }}`; env mirrors `LIVESTAGE_ARGS`/`LIVESTAGE_VAR_*`. The same
values reach `@code` (feature 29) via `LIVESTAGE_CONTEXT`.

## Architecture

Feeds the `{{ }}` interpolation layer owned by feature 19 (Composition
Directives) with an `args`/`vars` namespace, and feeds feature 29 (Code
Runners) with `LIVESTAGE_CONTEXT`.

## Implementation Notes

Passive hook renders carry no arguments (the hook knows only the file path),
so every document must render sensibly with args absent; `validate` flags a
document that dereferences args without an absent-args fallback (line
457-460, owned functionally by feature 27, Assert Liveness, which is where
the `validate`-time check lives, but the args-absent runtime behavior itself
is this component's responsibility). Arguments are untrusted data;
post-interpolation enforcement (feature 10) means they can never escalate
(line 461).

## Data Model

`LIVESTAGE_CONTEXT` (JSON, also consumed by `@code`): `{ args: string, argN:
string[], vars: Record<string,string>, doc: string }`.

## API/Interface

- CLI: `render doc.stage --args "<raw user prompt>" --var k=v`.
- Env: `LIVESTAGE_ARGS`, `LIVESTAGE_VAR_*`.
- Template: `{{ args }}`, `{{ arg0 }}..{{ argN }}`, `{{ vars.k }}`.
- Sandbox builtin: `allowed(arg0, "list", "sync")` for validated dispatch
  (line 455-456).

## Business Rules

1. `--args` exposes `{{ args }}` (the raw string) and tokenized
   `{{ arg0 }}..{{ argN }}` (line 453-454).
2. `--var k=v` exposes `{{ vars.k }}` (line 454).
3. Env mirrors: `LIVESTAGE_ARGS`, `LIVESTAGE_VAR_*` (line 454-455).
4. The same values reach `@code` via `LIVESTAGE_CONTEXT` (line 457).
5. Passive hook renders carry no arguments; every document must render
   sensibly with args absent (line 457-459).
6. `validate` flags a document that dereferences args without an absent-args
   fallback (line 459-460).
7. Arguments are untrusted data; post-interpolation enforcement means they
   can never escalate a policy grant (line 461).

## Acceptance Criteria

- [ ] `--args "sync"` makes `{{ args }}` == `"sync"` and `{{ arg0 }}` ==
      `"sync"` inside the render.
- [ ] `--var k=v` makes `{{ vars.k }}` == `"v"`.
- [ ] `LIVESTAGE_ARGS`/`LIVESTAGE_VAR_*` env vars produce the same bindings
      as the equivalent flags.
- [ ] A passive (hook) render of a document that dereferences `{{ args }}`
      without a fallback still renders without throwing.
- [ ] `LIVESTAGE_CONTEXT` passed to a `@code` script contains `args`, tokenized
      `argN`, `vars`, and `doc`.

## Dependencies

19-composition-directives (args are exposed through the interpolation
layer).

## Known Issues

None.
