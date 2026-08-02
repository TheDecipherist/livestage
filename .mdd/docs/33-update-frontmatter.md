---
id: 33-update-frontmatter
title: Update Frontmatter
type: COMPONENT
path: Directives / Update Frontmatter
source_files: [src/parser/directives/update-frontmatter.ts, src/engine/write-ops.ts, src/engine/frontmatter-utils.ts]
status: planned
phase: idle
last_synced: 2026-08-01
initiative: livestage
wave: livestage-wave-5
depends_on: [32-schema-engine]
tags: [update-frontmatter, sanctioned-write, atomic-write, schema-validated]
known_issues: []
---

# Update Frontmatter

## What to Build

`[verify->extend]`, copy from
`~/projects/markdownai/packages/engine/src/frontmatter-utils.ts` (extended
with pre-write schema validation). The `@update-frontmatter` directive: THE
one sanctioned write in the whole system, schema-validated pre-write, atomic.

## Architecture

The single write path everything else in the system funnels through when a
document needs to persist state (the multi-step pattern in feature 40 relies
on this for state round-tripping). Any write that is not this directive or a
policy-granted `@code` script is out of scope for the entire build
(Principle 4, line 95-97).

## Implementation Notes

"Extend" disposition: the donor's frontmatter-utils subsystem is the base,
but pre-write schema validation (against feature 32's schema engine) is new
behavior layered on top, since the donor did not have F-SCHEMA.

## Data Model

N/A (writes are validated against the target document's declared schema
class, feature 32).

## API/Interface

`@update-frontmatter path= <fields>` (line 350).

## Business Rules

1. THE sanctioned write; schema-validated pre-write; atomic (line 350,
   95-97).
2. A write violating the target's declared schema is blocked pre-write with
   a named error (line 631-632, Wave 5 demo-state).
3. A conforming update lands atomically (line 632).

## Acceptance Criteria

- [ ] A conforming `@update-frontmatter` call updates the target document's
      frontmatter and the change is durable and atomic (no partial-write
      state observable on failure).
- [ ] A call that violates the target's declared schema is blocked pre-write
      with a named, specific error (not a generic failure).
- [ ] CR-10 (Render Purity, feature 15) confirms this is the only write
      surface exercised by the purity harness's allowed-mutation list.

## Dependencies

32-schema-engine (pre-write validation).

## Known Issues

None.
