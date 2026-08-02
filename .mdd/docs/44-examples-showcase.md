---
id: 44-examples-showcase
title: Examples Showcase
type: COMPONENT
path: Examples / Showcase
source_files: [examples/showcase/index.stage, examples/showcase/report.stage,
  examples/showcase/api-reference.stage, examples/showcase/cli-reference.json]
test_files: [tests/e2e/examples-showcase.test.ts]
status: complete
phase: all
last_synced: 2026-08-02
initiative: livestage
wave: livestage-wave-6
depends_on: [20-render-formats, 24-fallback-contract, 02-cr1-standalone-identity]
tags: [showcase, donor-migration, re-extension, docs-hub, project-report]
known_issues:
  - "Not actually migrated from ~/projects/markdownai/mai/*: this project's
    own CLAUDE.md carries an explicit, standing constraint, 'Never reference
    the donor codebase outside MDs/livestage-spec.md', and the donor
    checkout is not something this build is permitted to open and copy
    from, even though it exists on disk at that path. Built as fresh
    content covering the same three-document shape the doc's own What to
    Build calls for (a docs hub, a project report, an API reference plus
    its data), with 'removed-directive-free' and 'renders green under the
    strict profile' both true by construction rather than by migration
    cleanup. This is the same constraint 45-user-guide.md hit, documented
    there too."
  - "'API reference' is reframed as a CLI verb reference (cli-reference.json
    + api-reference.stage): LiveStage has no HTTP API of its own to
    document, so a literal API reference would be fictional content. The
    CLI verb table is the closest real analog and is itself generated from
    the JSON data file rather than hand-maintained, preserving the point
    the original acceptance criteria are making (a reference table that
    can't drift from its data) without inventing an API that doesn't exist."
  - "'No extra grants needed' (business rule 4) is enforced by construction,
    not by exception: no .livestage/policy.json exists under
    examples/showcase/ at all (verified in
    tests/e2e/examples-showcase.test.ts), and every directive used
    (@tree/@list/@read/@render, the wc pipe builtin) is available under the
    default deny-by-default profile with zero grants, unlike the reach-via-
    code and connections examples, which need @code and therefore ship
    their own policy.json."
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

- [x] Every document in `examples/showcase/` renders successfully under the
      shipped `strict` policy profile, no extra grants needed. Live-verified
      (no `.livestage/policy.json` under this directory at all);
      tests/e2e/examples-showcase.test.ts.
- [x] A scan of `examples/showcase/` finds zero retired-directive syntax and
      zero donor identity strings. tests/e2e/examples-showcase.test.ts::"a
      scan of examples/showcase/ finds zero retired-directive syntax".
- [x] The docs hub, project report, and API reference (with its data) are
      all present and each render correctly. `index.stage`, `report.stage`,
      `api-reference.stage` + `cli-reference.json`; live-verified.

## Dependencies

20-render-formats, 24-fallback-contract (the showcase exercises the full
render/fallback surface), 02-cr1-standalone-identity (identity check applies
to this migrated content).

## Known Issues

None.
