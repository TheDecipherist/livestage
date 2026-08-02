---
id: 01-seed-script
title: Seed Script
type: task
path: Build / Seed Script
source_files: []
status: planned
phase: idle
last_synced: 2026-08-01
initiative: livestage
wave: livestage-wave-0
depends_on: []
tags: [seed, donor-copy, rename, doc-corpus, exclusion-list, package-scaffold]
known_issues: []
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

- [ ] Fresh repo, no donor git history.
- [ ] Every copy-map row (spec table, lines 159-176) has landed at its target
      path.
- [ ] None of the excluded subsystems exist anywhere in the tree.
- [ ] Merged vitest config runs; failures exist only in intentionally excluded
      areas, enumerated as the CR-7 baseline.
- [ ] `package.json` is single-package: name `livestage`, bin `livestage`,
      export subpaths `livestage/parser`, `livestage/engine`,
      `livestage/renderer`.
- [ ] `.mdd/docs/` contains the mechanically migrated donor doc corpus with
      repathed `source_files`/`test_files` and recomputed content hashes.
- [ ] CR-1 identity grep is clean, or every remaining hit is enumerated as an
      explicit Wave 1 task.

## Dependencies

None (this is the first artifact in the build).

## Known Issues

None yet; the seed script's exact file location and invocation are not fixed
by the spec and should be settled and recorded here when Wave 0 actually runs.
