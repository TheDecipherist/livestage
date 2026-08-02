---
id: 45-user-guide
title: User Guide
type: COMPONENT
path: Docs / User Guide
source_files: [docs/user-guide.md]
status: planned
phase: idle
last_synced: 2026-08-01
initiative: livestage
wave: livestage-wave-6
depends_on: [02-cr1-standalone-identity, 40-pattern-example]
tags: [user-guide, manual, architecture-corrected, covering-patterns]
known_issues: []
---

# User Guide

## What to Build

`[verify: donor manual]`, copy from
`~/projects/markdownai/.mdd/manual/manual.md`. Migrated, renamed,
architecture-corrected (stateless, no server, `.stage` only). The output
target path is not fixed by the spec's Project Structure listing; a
reasonable default is `docs/user-guide.md`, to be confirmed during Wave 6
build.

## Architecture

The document that explains the covering patterns for everything the language
deliberately excludes: multi-step work is the F-PATTERN example (feature
40); file production, database, and HTTP work are `@code` under policy (the
Wave 6 reach-via-code examples, feature 47) (line 359-361).

## Implementation Notes

"Architecture-corrected" is the operative instruction: the donor manual
describes a stateful, server-capable tool in places, and every such
description must be rewritten to match this build's actual architecture
(stateless, no daemon, `.stage`-only routing) rather than copied verbatim
where it would misdescribe the shipped tool.

## Data Model

N/A.

## API/Interface

N/A. A reference document, not a directive or CLI surface.

## Business Rules

1. Migrated from the donor manual, not written from scratch (CR-D7, feature
   39).
2. Renamed: no donor brand strings survive.
3. Architecture-corrected: stateless, no server, `.stage`-only routing
   claims match this build, not the donor's.
4. Documents the covering patterns for excluded directive classes
   (multi-step, file production, database, HTTP) by name, with a link to
   the relevant worked example (feature 40, feature 47) (line 359-361).

## Acceptance Criteria

- [ ] The guide's architecture description matches this build exactly
      (no server/daemon/session language surviving from the donor manual).
- [ ] Every retired directive class is covered by name with a pointer to its
      replacement pattern.
- [ ] Zero donor identity strings survive (CR-1 scan passes against this
      file).
- [ ] Linked from `init`'s CLAUDE.md marker section as the canonical
      authoring reference.

## Dependencies

02-cr1-standalone-identity (rename correctness), 40-pattern-example (the
guide links to the worked multi-step example).

## Known Issues

The final output path for the migrated guide is inferred (`docs/user-
guide.md`) rather than fixed by the spec; confirm and update `source_files`
during Wave 6 build.
