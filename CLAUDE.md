# CLAUDE.md

## What this project is

LiveStage is a live-document renderer and verifier for AI agents. A `.stage` file
mixes prose with executable directives instead of storing static data: file
listings, frontmatter reads, git queries, hashes, test results, script output,
assertions. When an agent reads the file, the engine resolves every directive at
that moment and returns pure markdown, with zero directive syntax remaining. The
directive syntax exists only at rest, for authors; the agent consuming a render
needs no knowledge of LiveStage at all.

The deliverable is one npm package, `livestage` (npm `livestage`, livestage.dev),
with five internal modules (parser, engine, renderer, cli, hook), one bin
(`livestage`), and a self-contained single-file bundle. There is no server. The
integration surface is a PreToolUse hook that renders `.stage` reads inline, a
SessionStart hook that injects designated briefs, and a CLI that behaves
identically in an agent session and in CI.

## Core philosophy

The agent decides, LiveStage computes. The engine never judges, gates, or
chooses; it resolves deterministic data and hands it back as markdown. Reads are
pure: the only sanctioned write is `@update-frontmatter`, schema-validated and
atomic. Everything else that needs to touch the world goes through
policy-granted `@code`, where the write is visible, granted, and traced. Every
directive declares a static fallback, so a `.stage` file read without the engine
(or after a timeout) is still a usable, honest document that says it is
degraded. Nothing that exists in the donor codebase is ever rewritten, it is
copied, renamed, and verified; the same rule holds for the donor's feature-doc
corpus.

## Architecture overview

- `src/parser` - grammar, directive registry, args. Never imports `renderer`.
- `src/engine` - execution: sources, compute, composition, security (policy,
  immutable rules, masking), cache, stripper, code runners, assert operators,
  schema engine, args, determinism, trace.
- `src/renderer/formats` - the markdown shapes a pipeline can render into
  (table, tree, list, numbered, bar, code, json, inline, links).
- `src/cli` - the verb router; `cli render` is the single code path the hook
  also calls.
- `src/hook` - PreToolUse (extension match -> render -> substitute) and
  SessionStart (brief injection).
- `src/parser/directives/` - one file per directive (`@list`, `@foreach`,
  `@code`, etc.), 29 as of this writing; `src/engine/security/` - the
  per-surface policy checks (`checkShellCommand`, `checkDataPath`,
  `checkWritePath`, `checkAbsolutePath`), not one unified gate function.

Config lives in `.livestage/` per project (`policy.json`, `schemas/`, `cache/`,
`trace/`). Every execution surface (filesystem, shell, code) is deny-by-default,
resolved through one allowlist layer, enforced after `{{ }}` interpolation so no
argument can smuggle a command past policy.

`examples/` is self-verifying documentation, not just sample files:
`README.stage` and every `examples/**/*.stage` file ships a committed `.md`
rendering next to it, generated (`npm run readme` / `examples:render`) and
CI-enforced (`readme:check` / `examples:check`, `scripts/check-*.mjs`) never
to drift. Some examples are deliberately unchecked (live git state, wall-clock
timing, an environment-dependent directory) rather than byte-diffed, see
`scripts/example-render-targets.mjs`'s `checked`/`normalize` fields.

## Tech stack

TypeScript strict mode, no `any` in new code. Node.js 22 LTS, ESM. npm, single
package, no workspaces. Vitest for tests (one merged config, golden-file
snapshots for the render surface, a fixture-based security matrix). esbuild
single-file bundle to `dist/livestage.js`.

## Commands

- `npm run build` - compiles `src/` to `dist/` via `tsconfig.build.json`
  (declarations + source maps). Required before anything that runs the CLI
  from `dist/` (the `readme`, `examples:render`, `examples:check` scripts,
  and most e2e tests all shell out to `dist/cli/cli.js`).
- `npm run bundle` - esbuild single-file bundle to `dist/livestage.js`, the
  `bin` entry point; separate from `build`, run when testing the bundled
  distribution specifically (feature 41).
- `npm run typecheck` - bare `tsc --noEmit` over the WHOLE project
  (`src` + `tests`), stricter than `build`'s `src`-only check. `tests/`
  passing this cleanly is a known, tracked gap (implicit-`any` in the
  auto-generated `tests/conformance/rules.conformance.test.ts`), harmless
  since that file is outside `build`'s scope, but don't mistake it for a
  regression.
- `npm run lint` - `eslint .`.
- `npm test` - the full Vitest suite. `npm run test:unit` scopes to
  `tests/unit` only.
- Single file or test: `npx vitest run tests/unit/engine/<file>.test.ts`
  (or any path under `tests/`); add `-t "<name>"` to filter by test name.
- `npm run test:baseline` - fails if the suite's test count drops below the
  committed floor (`scripts/check-test-baseline.mjs`); `test:baseline:update`
  raises the floor after a deliberate, reviewed reduction.
- `npm run readme` / `npm run readme:check` - `README.md` is generated from
  `README.stage`, never hand-edited. `readme` regenerates it; `readme:check`
  (CI-enforced) fails if the committed file drifts from a fresh render.
- `npm run examples:render` / `npm run examples:check` - the same pattern,
  generalized to every example under `examples/`: each `.stage` file ships a
  committed `.md` rendering next to it (see Architecture overview).
- CI (`.github/workflows/ci.yml`) runs, in order: `build`, `typecheck`,
  `lint`, `test`, `test:baseline`, `readme:check`, `examples:check`.

## MDD docs

This project's build is tracked in `.mdd/`. The feature docs in `.mdd/docs/` are
numbered in build order (`depends_on` only ever points to a lower id): read a
doc's id before touching its files, the number tells you what has to exist
first. Docs are grouped into waves under `.mdd/waves/` (`livestage-wave-0`
through `livestage-wave-6`, mirroring the spec's own wave numbering) inside the
`livestage` initiative. The spec's own reuse rule is load-bearing for every
wave: before writing anything, open the donor copy-map row for the feature,
read the donor source and its tests, and copy first. Writing code or a doc the
donor already has is a wave failure.

## Key constraints

- Only `.stage` files are ever parsed or executed. No content sniffing, no
  header directive, ever.
- No daemon, no socket, no cross-invocation memory. The render trace is
  append-only and the engine never reads it back.
- No em dashes anywhere in new source; use a comma or a single hyphen.
- Never reference the donor codebase outside `.mdd/specs/livestage-spec.md`
  (the imported snapshot; the donor's own path is not part of this repo).
- A test must never mutate a git-tracked file as an uncontrolled side
  effect of running (found in feature 48: a test called an npm script that
  regenerated the real, tracked `README.md`, which silently defeated the
  CI drift-check step that ran after it, since by the time it checked, the
  test suite had already "fixed" the drift). Write to a scratch path
  (`.ai_temp/`, an OS tmpdir, or a `-o`/`--out` flag pointed elsewhere)
  instead, never to the file a later step is meant to verify.
- A "proves the check isn't vacuous" test that deliberately, temporarily
  overwrites a real tracked file (restored in `finally`, the established
  pattern for `readme:check`/`examples:check`'s own non-vacuousness proofs)
  is safe in isolation, but Vitest runs test FILES in parallel by default:
  a second, unrelated test file reading that same tracked file can catch it
  mid-mutation. Prefer rendering fresh over reading a committed file shared
  with another test's mutation window; found and fixed live during the
  `examples:check` rollout.
- `.claude/rules/` carries this user's global rule set, most of which
  targets an HTTP service (security headers, rate limiting, MongoDB,
  React Router, nginx). LiveStage is a CLI/library with no server: the 6
  recurring `tests/conformance/rules.conformance.test.ts` failures for
  those rules are expected here, not a regression to chase.
