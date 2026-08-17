---
id: 50-version-1.0.0-and-license
title: Version 1.0.0 and MIT License
type: task
path: Packaging / Release
source_files: [package.json, LICENSE]
status: complete
phase: all
last_synced: 2026-08-17
initiative: livestage
tags: [release, packaging, npm, license]
---

# Version 1.0.0 and MIT License

## What

Bumped `package.json`'s `version` from `0.0.1` to `1.0.0`, and added a
standard MIT `LICENSE` file at the repo root.

## Why

`0.0.1` was already published to npm two weeks prior as an explicit
placeholder ("placeholder - full release coming soon"). npm rejects
re-publishing an existing version, so no further publish could happen
without a bump regardless of readiness. `1.0.0` was chosen deliberately
(not `0.1.0`) because this is the first real release of a complete,
tested package: build, bundle, lint, and 1308/1315 tests pass (the 7
failures are pre-existing and unrelated, see the Notes below), the CLI
binary was smoke-tested live, and the package.json already declares
`"license": "MIT"` but shipped no LICENSE file, which is a standard
publish-hygiene gap most tooling (npm, GitHub license detection) expects
filled.

## Notes

The 7 pre-existing test failures (not touched by this task, not a
release blocker): 6 in `tests/conformance/rules.conformance.test.ts`
assert HTTP-service patterns (helmet/CSP headers, SIGTERM/SIGINT
handling, viewport meta) that do not apply to this library/CLI project;
1 in `tests/golden/deterministic-snapshots.test.ts > tree` is a snapshot
tied to the real calendar date (the trace filename embeds the render
date), expected to drift daily by design.

Also identified during this task, tracked separately, not addressed
here: `npm run typecheck` (bare `tsc --noEmit`, which includes `tests/`)
fails on `tests/conformance/rules.conformance.test.ts` (implicit-`any`
params in the auto-generated file); this is outside `tsconfig.build.json`'s
`include` (`src` only) so it does not affect what gets built or published.
