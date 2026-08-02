---
id: 23-arguments
title: Arguments (F-ARGS)
type: COMPONENT
path: Engine / Args
source_files: [src/engine/args.ts]
status: complete
phase: all
last_synced: 2026-08-01
initiative: livestage
wave: livestage-wave-2
depends_on: [19-composition-directives]
tags: [args, vars, allowed-builtin, livestage-context, absent-args-fallback]
known_issues:
  - "Built as an extension of the existing donor skill-context-variables machinery (SkillContext in context.ts, buildSkillContext in render.ts) rather than a parallel mechanism: --args is an alternate source for the same args/argsList the pre-existing --skill-args populates (either flag sets the same {{ args }}/{{ arg0 }}..{{ arg3 }} bindings), and a new vars: Record<string,string> field was added to SkillContext for --var/LIVESTAGE_VAR_*, exposed as {{ vars.k }} (namespaced, not flattened, unlike the pre-existing namedArgs field which spreads flat and is reserved for skill-frontmatter-declared arguments, a different, still-unused donor concept)."
  - "LIVESTAGE_CONTEXT (the JSON blob feature 29's @code is meant to read) is built by buildLiveStageContextJson in the new src/engine/args.ts and unit-tested directly, but is not yet wired to any actual @code invocation, since @code does not exist (feature 29, wave 4). This component's scope is the data model and its construction; the wiring is feature 29's job when it lands."
  - "arg0..arg3 are the donor's existing hardcoded convention (four positional slots), not a truly unbounded argN; the full tokenized list is always available as {{ argsList }} for anything beyond index 3."
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

- [x] `--args "sync"` makes `{{ args }}` == `"sync"` and `{{ arg0 }}` ==
      `"sync"` inside the render. Live-verified and
      `tests/unit/cli/render-args.test.ts`.
- [x] `--var k=v` makes `{{ vars.k }}` == `"v"`. Live-verified and tested.
- [x] `LIVESTAGE_ARGS`/`LIVESTAGE_VAR_*` env vars produce the same bindings
      as the equivalent flags: readable via `@env`, live-verified and
      `render-args.test.ts::LIVESTAGE_ARGS and LIVESTAGE_VAR_<K> are
      readable via @env`. `LIVESTAGE_VAR_*` as an alternate INPUT (set in
      the process environment instead of `--var`) is also supported:
      `tests/unit/engine/args.test.ts`'s `buildArgsContext` env-fallback
      cases.
- [x] A passive (hook) render of a document that dereferences `{{ args }}`
      without a fallback still renders without throwing: live-verified and
      `render-args.test.ts::a passive render with no args/vars at all`.
- [x] `LIVESTAGE_CONTEXT`'s data model contains `args`, tokenized `argN`,
      `vars`, and `doc`: `buildLiveStageContextJson`,
      `tests/unit/engine/args.test.ts`. Not yet wired to an actual `@code`
      invocation since `@code` does not exist yet, see Known Issues.

## Dependencies

19-composition-directives (args are exposed through the interpolation
layer).

## Known Issues

See the frontmatter `known_issues` above: the relationship between `--args`
and the pre-existing `--skill-args`, the `vars` namespace being new
(distinct from the pre-existing, still-unused `namedArgs` field), and the
`LIVESTAGE_CONTEXT`-to-`@code` wiring deferred to feature 29.
