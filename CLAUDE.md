# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code
in this repository.

This file is generated, the same way `README.md` is: every count, list, and command
below is read live from the project itself by `CLAUDE.stage`, never hand-typed. Run
`npm run claude-md` to regenerate `CLAUDE.md`; `npm run claude-md:check` fails if it
would produce a different file than what is currently committed, and that check runs
in CI. See "How this file stays current" at the bottom. The reason this exists: an
earlier hand-typed version of this file said "29 directives, as of this writing" and
a separate line referenced a donor spec path that had already stopped existing, both
caught only because someone happened to grep for them. A file every session reads
first should not be the one place in the project drift is allowed to hide.

## What this project is

LiveStage is a live-document renderer and verifier for AI agents. A `.stage` file
mixes prose with executable directives instead of storing static data: file
listings, frontmatter reads, git queries, hashes, test results, script output,
assertions. When an agent reads the file, the engine resolves every directive at
that moment and returns pure markdown, with zero directive syntax remaining. The
directive syntax exists only at rest, for authors; the agent consuming a render
needs no knowledge of LiveStage at all.

The deliverable is one npm package, livestage (npm livestage,
livestage.dev), with 5 internal modules under `src/`
(described below), one bin (dist/livestage.js), and a self-contained single-file
bundle. There is no server. The integration surface is a PreToolUse hook that
renders `.stage` reads inline, a SessionStart hook that injects designated
briefs, and a CLI that behaves identically in an agent session and in CI.

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
- `src/renderer/formats` - the markdown shapes a pipeline can render into:
src/renderer/formats/bar.ts
src/renderer/formats/code.ts
src/renderer/formats/inline.ts
src/renderer/formats/json.ts
src/renderer/formats/links.ts
src/renderer/formats/list.ts
src/renderer/formats/numbered.ts
src/renderer/formats/table.ts
src/renderer/formats/tree.ts
- `src/cli` - the verb router; `cli render` is the single code path the hook
  also calls.
- `src/hook` - PreToolUse (extension match -> render -> substitute) and
  SessionStart (brief injection).
- `src/parser/directives/` - one file per directive (`@list`, `@foreach`,
  `@code`, etc.), 29 as of this render. `src/engine/security/`
  - the per-surface policy checks, one file per surface, not one unified gate
  function:
src/engine/security/audit.ts
src/engine/security/config.ts
src/engine/security/filesystem.ts
src/engine/security/masking.ts
src/engine/security/modes.ts
src/engine/security/path-expand.ts
src/engine/security/rules.ts
src/engine/security/shell.ts

Config lives in `.livestage/` per project (`policy.json`, `schemas/`, `cache/`,
`trace/`). Every execution surface (filesystem, shell, code) is deny-by-default,
resolved through one allowlist layer, enforced after interpolation so no
argument can smuggle a command past policy.

`examples/` is self-verifying documentation, not just sample files:
`README.stage`, `CLAUDE.stage`, and every `examples/**/*.stage` file
(19 of them at this render) ships a committed `.md`
rendering next to it, generated (`npm run readme` / `npm run claude-md` /
`examples:render`) and CI-enforced (`readme:check` / `claude-md:check` /
`examples:check`, `scripts/check-*.mjs`) never to drift. Some examples are
deliberately unchecked (live git state, wall-clock timing, an
environment-dependent directory) rather than byte-diffed, see
`scripts/example-render-targets.mjs`'s `checked`/`normalize` fields.

## Tech stack

TypeScript strict mode, no `any` in new code. Node.js >=22, ESM. npm,
single package, no workspaces. Vitest for tests (one merged config, golden-file
snapshots for the render surface, a fixture-based security matrix). esbuild
single-file bundle to `dist/livestage.js`.

## Commands

Every `npm run` script, read live from `package.json` so a rename or removal
shows up here on the next render instead of silently going stale:

| script               | command                                                                                                                                                                                                                                                                               |
|----------------------|---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| build                | tsc -p tsconfig.build.json && node -e "require('fs').copyFileSync('src/engine/stdlib.md', 'dist/engine/stdlib.md')"                                                                                                                                                                   |
| bundle               | esbuild src/cli/cli.ts --bundle --platform=node --format=esm --outfile=dist/livestage.js --banner:js="import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" && node -e "require('fs').copyFileSync('src/engine/stdlib.md', 'dist/stdlib.md')" |
| typecheck            | tsc --noEmit                                                                                                                                                                                                                                                                          |
| lint                 | eslint .                                                                                                                                                                                                                                                                              |
| test                 | vitest run                                                                                                                                                                                                                                                                            |
| test:unit            | vitest run tests/unit                                                                                                                                                                                                                                                                 |
| test:baseline        | node scripts/check-test-baseline.mjs                                                                                                                                                                                                                                                  |
| test:baseline:update | node scripts/check-test-baseline.mjs --update                                                                                                                                                                                                                                         |
| readme               | node dist/cli/cli.js build README.stage -o README.md                                                                                                                                                                                                                                  |
| readme:check         | node scripts/check-readme.mjs                                                                                                                                                                                                                                                         |
| claude-md            | node dist/cli/cli.js build CLAUDE.stage -o CLAUDE.md                                                                                                                                                                                                                                  |
| claude-md:check      | node scripts/check-claude-md.mjs                                                                                                                                                                                                                                                      |
| examples:render      | node scripts/render-examples.mjs                                                                                                                                                                                                                                                      |
| examples:check       | node scripts/check-example-renders.mjs                                                                                                                                                                                                                                                |

Notes that don't fit a one-line command table:
- `build` compiles `src/` to `dist/` via `tsconfig.build.json` (declarations +
  source maps). Required before anything that runs the CLI from `dist/` (the
  `readme`, `claude-md`, `examples:render`, `examples:check` scripts, and most
  e2e tests all shell out to `dist/cli/cli.js`).
- `typecheck` is a bare `tsc --noEmit` over the WHOLE project (`src` + `tests`),
  stricter than `build`'s `src`-only check. `tests/` passing this cleanly is a
  known, tracked gap (implicit-`any` in the auto-generated
  `tests/conformance/rules.conformance.test.ts`), harmless since that file is
  outside `build`'s scope, but don't mistake it for a regression.
- Single file or test: `npx vitest run tests/unit/engine/<file>.test.ts` (or
  any path under `tests/`); add `-t "<name>"` to filter by test name. This
  isn't a package.json script, just a direct vitest invocation.
- CI (`.github/workflows/ci.yml`) runs the check/verify half of the table
  above (`build`, `typecheck`, `lint`, `test`, `test:baseline`,
  `readme:check`, `claude-md:check`, `examples:check`), in that order.
  The write half (`readme`, `claude-md`, `examples:render`, `bundle`,
  `test:unit`, `test:baseline:update`) is for local regeneration only.

## MDD docs

This project's build is tracked in `.mdd/`. The feature docs in `.mdd/docs/` are
numbered in build order (`depends_on` only ever points to a lower id): read a
doc's id before touching its files, the number tells you what has to exist
first. Docs are grouped into waves under `.mdd/waves/` (7 waves,
mirroring the spec's own wave numbering) inside the `livestage` initiative. The
spec's own reuse rule is load-bearing for every wave: before writing anything,
open the donor copy-map row for the feature, read the donor source and its
tests, and copy first. Writing code or a doc the donor already has is a wave
failure.

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
  pattern for `readme:check`/`claude-md:check`/`examples:check`'s own
  non-vacuousness proofs) is safe in isolation, but Vitest runs test FILES
  in parallel by default: a second, unrelated test file reading that same
  tracked file can catch it mid-mutation. Prefer rendering fresh over
  reading a committed file shared with another test's mutation window;
  found and fixed live during the `examples:check` rollout.
- `.claude/rules/` carries this user's global rule set, most of which
  targets an HTTP service (security headers, rate limiting, MongoDB,
  React Router, nginx). LiveStage is a CLI/library with no server: the 6
  recurring `tests/conformance/rules.conformance.test.ts` failures for
  those rules are expected here, not a regression to chase.

## How this file stays current

`CLAUDE.stage` (the source of this file, not `CLAUDE.md` itself) reads:

- `package.json`'s name, bin, and required Node version, via `@read`,
- the module, directive, renderer-format, and security-file counts and
  names, via `@list`/`@count` against the real `src/` tree,
- every `npm run` script's name and command, via `@list ... mode="entries"`,
- the wave and example counts, via `@count` against `.mdd/waves/` and
  `examples/`.

Deliberately left as authored prose, not computed: the philosophy, the
per-module descriptions (what `src/parser` is FOR, not just that it exists),
the key constraints, and the lessons in each one. Those are judgment calls a
render cannot derive from the filesystem, the same distinction `README.stage`
draws for its own "Interface Overview" sections.

`npm run claude-md` regenerates `CLAUDE.md` by calling the existing
`livestage build` CLI verb, the same mechanism `npm run readme` uses.
`npm run claude-md:check` regenerates into a throwaway comparison and fails
if the committed `CLAUDE.md` differs, and that check runs in CI, so a stale
`CLAUDE.md` fails the build instead of quietly misleading the next session
that reads it.

This file needs no policy grant: every fact above comes from `@read`/`@list`/
`@count`, filesystem-policy directives, not shell. The same "no shell needed"
property `onboarding-brief.stage` demonstrates for a sample project holds
here for the real one.
