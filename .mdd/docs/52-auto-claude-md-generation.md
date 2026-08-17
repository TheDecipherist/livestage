---
id: 52-auto-claude-md-generation
title: Auto CLAUDE.md Generation
type: COMPONENT
path: Docs / CLAUDE.md Generation
source_files: [CLAUDE.stage, CLAUDE.md, scripts/check-claude-md.mjs,
  package.json, .github/workflows/ci.yml]
test_files: [tests/e2e/claude-md-generation.test.ts]
status: complete
phase: all
last_synced: 2026-08-17
initiative: livestage
depends_on: [48-auto-readme-generation]
tags: [claude-md, self-documenting, dogfooding, ci-drift-check, generated-file-replacement]
---

# Auto CLAUDE.md Generation

## Purpose

`CLAUDE.md` is the one file every Claude Code session in this repository reads
first, and until this feature it was hand-typed like any other doc: a stale
fact would sit there until someone happened to grep for it. That happened for
real, twice, in this exact file, found while auditing it for this feature: it
claimed "29 directives, as of this writing" (a number with no mechanism
keeping it true) and referenced a donor spec path, `MDs/livestage-spec.md`,
that had already stopped existing in this repo (the real snapshot lives at
`.mdd/specs/livestage-spec.md`). This feature applies feature 48's own
pattern (`README.stage` generates `README.md`, CI-enforced never to drift) to
`CLAUDE.md` itself: `CLAUDE.stage` at the repo root reads the project's real
state live and generates the committed `CLAUDE.md`, so the file that
onboards every session is no longer the one place in the project where drift
is allowed to hide.

## Architecture

`CLAUDE.stage` mirrors `README.stage`'s shape exactly: a block of `visible="false"`
directive calls at the top capturing labels, then markdown prose referencing
those labels via `{{ }}` or rendering them as inline list/table blocks.
`npm run claude-md` calls the existing `livestage build` CLI verb (the same
mechanism `npm run readme` uses) to write `CLAUDE.md`. `scripts/check-claude-md.mjs`
is `scripts/check-readme.mjs` copied almost line for line: render fresh,
compare against the committed file, fail loudly and non-mutating on drift,
wired into CI (`.github/workflows/ci.yml`) right after `readme:check`.

## Data Model

What's computed live, and how:
- `package.json`'s `name`, `bin.<name>`, and `engines.node`, via `@read ...
  path="..."` (dot-path extraction, the same mechanism `README.stage` already
  uses for its own version/description fields).
- Every `npm run` script's name and command, via
  `@list "package.json" path="scripts" mode="entries" | @render type="table"`,
  the exact `mode="entries"` support `listJson` already had (feature 17),
  first exercised for this purpose by `examples/drift/scripts-reference.stage`
  earlier in this same session.
- The module count (`src/`, top-level only, `@count "src" type="dirs"
  depth="0"`), the directive count (`src/parser/directives/*.ts`),
  renderer-format and security-file lists (`src/renderer/formats/`,
  `src/engine/security/`), and the wave/example counts (`.mdd/waves/`,
  `examples/**/*.stage`), via `@count`/`@list` with `match=`/`depth=`.

What's deliberately left as authored prose, never computed: the philosophy,
the per-module descriptions (what `src/parser` is FOR, not just that the path
exists), the key constraints and the lessons behind each one. Those are
judgment calls a render cannot derive from the filesystem, the same
distinction `README.stage` draws for its own hand-authored "Interface
Overview" sections versus its live directive-reference discovery query.

## API/Interface

N/A new directive; this composes `@read`, `@list`, `@count`, and `@render`
exactly as documented in features 17, 18, and 20. One real engine gap was
found (`@count`'s missing `depth=`) and fixed as its own follow-up bug,
see 17-source-directives B2.

## Business Rules

1. `CLAUDE.md` is never hand-edited; `npm run claude-md` regenerates it from
   `CLAUDE.stage`, matching feature 48's rule 1 for `README.md`.
2. `npm run claude-md:check` is non-mutating (renders to memory, never
   writes `CLAUDE.md`), matching feature 48's rule 2 and the same
   test/script-mutating-a-tracked-file failure mode CLAUDE.md's own Key
   Constraints section documents from feature 48's history: a check that
   mutates the thing it checks can silently defeat its own CI gate.
3. `CLAUDE.stage` needs no `.livestage/policy.json` grant: every fact it
   surfaces comes from filesystem-policy directives (`@read`/`@list`/
   `@count`), never shell, matching `onboarding-brief.stage`'s "a whole
   class of inspect-this-project work never needs shell access" point,
   now proven true of the real repo, not just a fixture.
4. `claude-md:check` runs in CI (`.github/workflows/ci.yml`) immediately
   after `readme:check`, so a stale `CLAUDE.md` fails the build the same
   way a stale `README.md` already does.

## Acceptance Criteria

- [x] `CLAUDE.stage` renders successfully under the repo's real, fully
      default (no policy.json) security posture, no SECURITY_ALERT.
      `tests/e2e/claude-md-generation.test.ts`.
- [x] The directive count, example count, package name/bin/node-engine, the
      renderer-format list, the security-file list, and every `npm run`
      script name all match a live, independently-computed value in the
      test, not just "appears somewhere in the output." Same file.
- [x] `npm run claude-md` (via the `build -o` verb) produces output
      byte-identical to a direct render of `CLAUDE.stage`. Same file.
- [x] `npm run claude-md:check` passes against the real, committed
      `CLAUDE.md`. Same file.
- [x] A regression test proves the backtick-interpolation trap (found live
      while first drafting this file: `` `{{ pkg_name }}` `` silently
      rendered as the literal text `{{ pkg_name }}`, the identical bug
      fixed in `examples/multi-step/index.stage`) cannot silently
      reappear. Same file.

## Dependencies

48-auto-readme-generation (this feature is that pattern's direct
generalization to a second file).

## Known Issues

None.

## Bug Fixes

### B1 (fixed 2026-08-17)
Symptom: `@count "src" type="dirs" depth="0"`, meant to report the 5
top-level module directories, returned 13 (every nested directory at
every depth counted too), so the module count could not be computed
live and was left as authored prose in the first draft of this file.
Cause: `executeCount` (sources.ts) hardcoded `walkDir`'s `maxDepth` to
`-1` (unlimited), the only source-directive call site that never read
`node.args['depth']` at all.
Fix: see 17-source-directives B2 (the actual engine fix). `CLAUDE.stage`
now uses `@count "src" type="dirs" depth="0"` for a genuinely live
module count | Regression test:
tests/e2e/claude-md-generation.test.ts::"the module count matches a
live, top-level-only count of src/"

See frontmatter `known_issues`: `@count`'s missing `depth=` support,
worked around here, not fixed in the engine.
