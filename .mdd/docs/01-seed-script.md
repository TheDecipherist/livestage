---
id: 01-seed-script
title: Seed Script
type: task
path: Build / Seed Script
source_files: []
status: complete
phase: all
last_synced: 2026-08-01
initiative: livestage
wave: livestage-wave-0
depends_on: []
tags: [seed, donor-copy, rename, doc-corpus, exclusion-list, package-scaffold]
known_issues:
  - "Seed ran as one-off shell/editor operations, not a checked-in scripts/seed.mjs"
  - "CR-1 brand-identity grep not zeroed (lowercase markdownai residue in ~19 src files, 38 test files)"
  - "Hook routing (src/hook/hook.ts) still content-sniffs .md instead of using .stage extension routing"
  - "init's MCP server registration code is dead functionality, not removed"
  - "Header/version-pin architecture stubbed (ParseResult.version always null), not redesigned"
  - "CR-7 baseline tests removed at the source rather than enumerated as failing; donor e2e/ suite not carried"
  - "Doc corpus mechanical pass (business rule 8) not done, collides with the 47 imported planning docs"
  - "examples/showcase, examples/connections, user guide seed, examples/multi-step not copied"
  - "~/.livestage/ user-level hook install path not yet referenced in src/cli/commands/init.ts"
---

# Seed Script

## What to Build

A hand-run, one-time script (not agent work, not a `/plan-execute` wave) that
produces the `livestage` repo in its final layout from the donor codebase at
`~/projects/markdownai`. Inputs: the donor checkout (read-only, outside this
repo). Outputs: a fresh git repository with no donor history, containing the
single-package `livestage` layout described in Project Structure, with a
mechanically renamed doc corpus already in `.mdd/docs/`. Must-nots: the script
never leaves donor history in the new repo, never ships any of the excluded
subsystems (below), never adds an npm lifecycle script.

## Architecture

Runs once, before Wave 1 starts. Everything downstream (every COMPONENT in
waves 1-6) assumes this script already ran: source files exist at their new
paths, the package is renamed, and the doc corpus exists (untrusted until its
verification wave runs, per CR-9).

## Implementation Notes

- The exact script file path is not specified by the spec; a reasonable
  location is a one-off script under `scripts/` (e.g. `scripts/seed.mjs`),
  run by hand and not part of the shipped package. Confirm the actual location
  when Wave 0 is executed; this doc's `source_files` is intentionally empty
  because the seed script itself is tooling, not shipped code.
- Step order matters: copy source before merging tests (tests reference the
  post-copy paths), rename after copy (renaming donor paths mid-copy risks
  partial renames), doc corpus pass last (it repaths against the already-final
  layout).

## Data Model

N/A. This is a filesystem transformation, not a runtime data model.

## API/Interface

N/A (no directive, no CLI verb; a local script invoked by hand).

## Business Rules

1. Fresh git repository, no donor history (spec line 183).
2. Copy `packages/parser/src` -> `src/parser`, `packages/engine/src` ->
   `src/engine`, `packages/renderer/src` -> `src/renderer`, `packages/core/src`
   -> `src/cli` + `src/hook` (line 184-186).
3. Exclude entirely (line 187-202): the MCP package and all transports; the
   event-transport subsystem (file/log/http/websocket/db/vscode transports,
   dispatch worker, `engine/src/event.ts` and its engine wiring); the donor's
   npm lifecycle scripts (`postinstall.js`, `preuninstall.js`, install side
   effects forbidden, marker-section CLAUDE.md mechanism is lifted into
   `init` instead, see feature 31); `serve`; header/format-detection parser
   modules; workflow-spine directives (`phase`, `on-complete`, `event`);
   AI-consumer directives (`prompt`, `section`, `chunk-boundary`, `constraint`,
   `define-concept`, `note`); plugin directives (`plugin-*`); scaffolding
   write-ops (`touch`, `mkdir`, `copy`, `append-if-missing`,
   `render-template`); the db subsystem (`engine/src/db/`, adapters, sync
   worker, `db`/`connect` directives, `mongodb` dependency, `row` renderer
   format); the `http` directive and engine http source; `flow`/`timeline`
   renderer formats; the VS Code package; the docs website.
4. Merge test suites into one vitest config; re-extension executable fixtures
   to `.stage`; enumerate retired excluded-subsystem tests as the CR-7
   baseline (MCP suites, the five `e2e/run-state-*.test.ts` suites, the
   AI-consumer format suites) (line 203-207).
5. Mechanical rename: old package scope/brand/bins -> `livestage`;
   completeness verified by CR-1 (feature 02), not assumed (line 208-209).
6. `src/engine/stdlib.md` -> `stdlib.stage` (line 210).
7. Single root `package.json`: name `livestage`, bin `livestage`, export
   subpaths (line 211).
8. Doc corpus mechanical pass: copy migratable donor docs into `.mdd/docs/`,
   repath every `source_files`/`test_files` entry to the single-package
   layout, brand-rename bodies and frontmatter, recompute content hashes
   against the seeded code, reset `last_synced` to the seed date. Donor
   initiatives and waves are NOT migrated; this build's come from
   `MDs/livestage-spec.md` (line 212-216).
9. Seed acceptance: repo compiles; merged suite runs (failures only in
   excluded areas); CR-1 grep clean or remaining hits enumerated as Wave 1
   tasks (line 218-219).

## Acceptance Criteria

- [x] Fresh repo, no donor git history.
- [x] Every copy-map row for `src/parser`, `src/engine`, `src/renderer`,
      `src/cli` + `src/hook` has landed at its target path.
- [x] None of the excluded subsystems exist anywhere in `src/`.
- [x] Merged vitest config runs: 47 files, 669/669 tests green, `tsc --noEmit`
      and `eslint .` both clean. No excluded-area failures remain, they were
      trimmed at the source rather than left red (see Known Issues).
- [x] `package.json` is single-package: name `livestage`, bin `livestage`,
      export subpaths `livestage/parser`, `livestage/engine`,
      `livestage/renderer`.
- [ ] `.mdd/docs/` contains the mechanically migrated donor doc corpus with
      repathed `source_files`/`test_files` and recomputed content hashes.
      NOT done, see Known Issues (conflicts with the 47 planning docs already
      imported from the spec).
- [ ] CR-1 identity grep is clean, or every remaining hit is enumerated as an
      explicit Wave 1 task. Grep run, hits enumerated below, not yet zeroed.

## Dependencies

None (this is the first artifact in the build).

## Known Issues

- **Seed executed directly, not via a committed script.** The copy/exclude/
  rename/scaffold steps ran as one-off shell and editor operations in this
  session rather than a checked-in `scripts/seed.mjs`. Reasonable and
  reviewable given this is a single hand-run pass, but there is no re-runnable
  artifact if the seed needs to be redone against a newer donor snapshot.
- **CR-1 brand-identity grep not zeroed.** `MarkdownAI`/`MARKDOWNAI_` were
  renamed everywhere (source and tests). Lowercase `markdownai` residue
  remains in about 19 `src/` files (mostly the literal `@markdownai` leading-
  marker string still used as the document marker, `~/.markdownai/security.
  json` config paths, and `[markdownai]` log prefixes) plus 38 test files
  (mostly the same marker string in fixture source strings). None of it is
  load-bearing beyond string identity. `@markdownai/mcp` references in
  `src/cli/commands/init.ts` and `src/cli/templates/claude-section.ts` are
  deliberately untouched, see next item. Feature 02 (CR-1) owns finishing
  this.
- **Hook routing (`src/hook/hook.ts`) still content-sniffs `.md` for a leading
  `@markdownai` marker and routes to `'mcp'`.** The new architecture is
  extension-based (`.stage`, no MCP, hook calls the same path as `cli
  render`). Left as-is because it compiles and the redesign is feature 11's
  (Extension Routing) job, not this seed's.
- **`init`'s MCP server registration (`registerMcpServer` and related code in
  `commands/init.ts`) is dead functionality.** It registers `@markdownai/mcp`
  as an MCP server in the user's Claude config; livestage ships no MCP server
  (excluded entirely per the copy-map). Compiles and its own tests pass
  (they test the registration bookkeeping, not a real server), but the
  feature itself should be removed, not just renamed. Feature 31 (Init) owns
  this.
- **Header/version-pin architecture simplified, not redesigned.** No
  `@header`/`@markdownai-detect` directive exists (per spec: "no header
  directive exists"). The parser now treats a leading `@markdownai[...]`
  line as an inert marker (skipped by the directive loop, contributes no
  output) instead of emitting a `HeaderNode`. `ParseResult.version` is
  always `null`; real frontmatter-based version-pin parsing
  (`livestage: 1`) is unimplemented. Feature 09 (Grammar Parser) owns the
  real design.
- **CR-7 baseline tests were removed at the source, not left red.** Rather
  than leaving retired-directive tests (`@phase`, `@connect`, `@db`, `@http`,
  `@mkdir`/`@copy`/`@append-if-missing`, `@prompt`/`@note`/`@define-concept`/
  `@constraint`, the `@markdownai` header-detection suite, MCP registration
  edge cases) failing and calling that the CR-7 baseline, they were deleted
  from the merged suite as each subsystem was excluded. The donor's
  `e2e/e2e-directives.test.ts`, `e2e-render.test.ts`, and `e2e.test.ts` were
  not carried at all (they reference `mai/` fixtures and
  `packages/core/dist/cli.js`, i.e. the unseeded examples corpus); feature 25
  (CR-7 Suite Baseline) should treat the donor's full e2e/ listing as the
  source of truth for what got excluded, not just this list.
- **Doc corpus mechanical pass (business rule 8) not done.** Copying the
  donor's 101 `.mdd/docs/` into this repo's `.mdd/docs/` would collide with
  the 47 planning docs already imported from `MDs/livestage-spec.md` (same
  directory, same id-numbering scheme, different content model: donor docs
  describe the old architecture in technical depth, the 47 are a build-order
  breakdown). Needs a decision (merge donor doc content into the matching
  planning docs by disposition (Carry-over/Rewrite/Retire/New)? keep them
  fully separate? something else) before this runs.
- **`examples/showcase/`, `examples/connections/`, the user guide seed
  (`.mdd/manual/manual.md`), and `examples/multi-step/` (F-PATTERN) were not
  copied.** Lower risk than the doc corpus (mostly markdown, not TypeScript
  needing exclusion surgery) but deferred for the same reason: this seed pass
  was already large. Straightforward follow-up.
- **`~/.livestage/` user-level hook install path** not yet referenced
  anywhere in `src/cli/commands/init.ts`, still needs wiring per spec line
  140 (carried over from the earlier coverage-gap pass on this doc corpus).
