---
id: 44-examples-showcase
title: Examples Showcase
type: COMPONENT
path: Examples / Showcase
source_files: [examples/showcase/]
status: planned
phase: idle
last_synced: 2026-08-01
initiative: livestage
wave: livestage-wave-6
depends_on: [20-render-formats, 24-fallback-contract, 02-cr1-standalone-identity]
tags: [showcase, donor-migration, re-extension, docs-hub, project-report]
known_issues: []
---

# Examples Showcase

## What to Build

`[verify: donor mai/ corpus]`, copy from `~/projects/markdownai/mai/*`.
Re-extensioned (donor's format -> `.stage`), renamed, removed-directive-free,
rendering green under the strict profile. Contents per the spec: a docs hub,
a project report, an API reference plus its data.

## Architecture

Exercises the render surface end to end (features 17-24) against realistic,
non-trivial documents, and doubles as the CR-1 (feature 02) proof point that
a fully renamed, donor-derived example carries no donor identity.

## Implementation Notes

"Removed-directive-free" means every retired donor directive (`@phase`,
`@db`, `@http`, etc., line 355-361) must have been rewritten out of these
examples during migration, not merely left to fail; a showcase example that
still contains a retired directive is not migrated, it is broken.

## Data Model

N/A (the showcase's own content, not a schema this build defines).

## API/Interface

N/A. Rendered via `livestage render examples/showcase/<doc>.stage` like any
other document.

## Business Rules

1. Copied from `~/projects/markdownai/mai/*`, re-extensioned to `.stage`
   (line 173, 678-679).
2. Renamed (no donor brand strings survive, per CR-1).
3. Removed-directive-free: no retired donor directive syntax remains
   (line 679).
4. Renders green under the strict profile with no additional policy grants
   (line 679).

## Acceptance Criteria

- [ ] Every document in `examples/showcase/` renders successfully under the
      shipped `strict` policy profile, no extra grants needed.
- [ ] A scan of `examples/showcase/` finds zero retired-directive syntax and
      zero donor identity strings.
- [ ] The docs hub, project report, and API reference (with its data) are
      all present and each render correctly.

## Dependencies

20-render-formats, 24-fallback-contract (the showcase exercises the full
render/fallback surface), 02-cr1-standalone-identity (identity check applies
to this migrated content).

## Known Issues

None.
