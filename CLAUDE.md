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

Config lives in `.livestage/` per project (`policy.json`, `schemas/`, `cache/`,
`trace/`). Every execution surface (filesystem, shell, code) is deny-by-default,
resolved through one allowlist layer, enforced after `{{ }}` interpolation so no
argument can smuggle a command past policy.

## Tech stack

TypeScript strict mode, no `any` in new code. Node.js 22 LTS, ESM. npm, single
package, no workspaces. Vitest for tests (one merged config, golden-file
snapshots for the render surface, a fixture-based security matrix). esbuild
single-file bundle to `dist/livestage.js`.

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
- Never reference the donor codebase outside `MDs/livestage-spec.md`.
