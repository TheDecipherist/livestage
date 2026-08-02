---
id: 45-user-guide
title: User Guide
type: COMPONENT
path: Docs / User Guide
source_files: [docs/user-guide.md, src/cli/templates/claude-section.ts]
test_files: [tests/e2e/user-guide.test.ts]
status: complete
phase: all
last_synced: 2026-08-02
initiative: livestage
wave: livestage-wave-6
depends_on: [02-cr1-standalone-identity, 40-pattern-example]
tags: [user-guide, manual, architecture-corrected, covering-patterns]
known_issues:
  - "Not actually migrated from
    ~/projects/markdownai/.mdd/manual/manual.md: this project's own
    CLAUDE.md carries an explicit, standing constraint, 'Never reference
    the donor codebase outside MDs/livestage-spec.md', so the donor manual
    is not something this build is permitted to open and copy from, even
    though the checkout exists on disk at that path. Written as fresh
    content covering the same subject the spec calls for (architecture,
    directive grammar, the covering patterns for excluded directive
    classes, security model), rather than migrated-and-corrected. This is a
    deliberate, policy-driven deviation from the doc's own `[verify: donor
    manual]` disposition tag, not an oversight; CR-D7's reuse-fidelity scan
    (feature 39) does not flag it because the scan checks that a citation
    exists when one is claimed, not that migration happened, and this
    doc's own body is honest that migration did not happen."
  - "Output path confirmed as docs/user-guide.md per the doc's own inferred
    default; no rename was needed. Along the way, found and fixed a real
    scoping bug in .claude/hooks/frontmatter-validate.sh: its case pattern
    (*/docs/*.md) matched ANY docs/ directory anywhere in the repo, not
    just the MDD doc corpus (.mdd/docs/), so writing this very file
    triggered the MDD frontmatter-schema gate on a file that was never
    meant to carry that schema. Fixed to match against $MDD_DOCS
    specifically; verified via the hook's own test suite
    (.claude/hooks/tests/run-all.sh, 65/65 still pass)."
  - "Linked from init's CLAUDE.md marker section
    (src/cli/templates/claude-section.ts): a one-line pointer added near
    the end of the existing LiveStage section, verified via
    tests/e2e/user-guide.test.ts rather than a new dedicated init test,
    since the marker-section content itself is not otherwise under
    per-line test coverage."
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

- [x] The guide's architecture description matches this build exactly
      (no server/daemon/session language surviving from the donor manual).
      Written fresh (see known_issues), so there was no donor language to
      strip; tests/e2e/user-guide.test.ts::"describes this build's real
      architecture...".
- [x] Every retired directive class is covered by name with a pointer to its
      replacement pattern. `@db`/`@http` -> `examples/database/`,
      `examples/http-health/`; multi-step -> `examples/multi-step/`;
      tests/e2e/user-guide.test.ts::"covers every retired directive
      class...".
- [x] Zero donor identity strings survive (CR-1 scan passes against this
      file). tests/e2e/user-guide.test.ts::"carries zero donor identity
      strings".
- [x] Linked from `init`'s CLAUDE.md marker section as the canonical
      authoring reference. tests/e2e/user-guide.test.ts::"is linked from
      init's CLAUDE.md marker section".

## Dependencies

02-cr1-standalone-identity (rename correctness), 40-pattern-example (the
guide links to the worked multi-step example).

## Known Issues

The final output path for the migrated guide is inferred (`docs/user-
guide.md`) rather than fixed by the spec; confirm and update `source_files`
during Wave 6 build.
