---
id: 33-update-frontmatter
title: Update Frontmatter
type: COMPONENT
path: Directives / Update Frontmatter
source_files: [src/parser/directives/update-frontmatter.ts, src/engine/write-ops.ts, src/engine/frontmatter-utils.ts]
status: complete
phase: all
last_synced: 2026-08-02
initiative: livestage
wave: livestage-wave-5
depends_on: [32-schema-engine]
tags: [update-frontmatter, sanctioned-write, atomic-write, schema-validated]
known_issues:
  - "@update-frontmatter itself was already fully built and seeded (write-ops.ts, including the bracket/dot-path list addressing tested in update-frontmatter-list.test.ts from an earlier wave); this feature's real scope was the two things layered on top: the schema pre-write gate (feature 32) and true atomic writes."
  - "Writes were NOT atomic before this wave: a single writeFileSync(target, content) call, which does not guarantee no-partial-state-on-crash the way business rule 3 requires. Fixed with write-to-temp-then-rename in the same directory (rename() is atomic on the same filesystem); a failure mid-write leaves an orphaned .tmp file, never a truncated target."
primitives:
  - name: "@update-frontmatter"
    kind: directive
---

# Update Frontmatter

## What to Build

`[verify->extend]`, copy from
`~/projects/markdownai/packages/engine/src/frontmatter-utils.ts` (extended
with pre-write schema validation). The `@update-frontmatter` directive: THE
one sanctioned write in the whole system, schema-validated pre-write, atomic.

## Interface Overview

`@update-frontmatter` is the one directive allowed to write anything.
Everything else in LiveStage only reads; this is how a document persists
state between renders, like a multi-step pipeline recording progress in
its own frontmatter. The write is validated against the target's declared
schema before it happens, and lands atomically, so a crash mid-write never
leaves a corrupted file.

| Name | What it does |
|---|---|
| `@update-frontmatter` | Writes one field into a markdown file's YAML frontmatter. |

### @update-frontmatter

Updates a single frontmatter field on the target document, creating it if
absent.

```stage
@update-frontmatter path="state.md" field="status" value="done" /
```

| Parameter | Values | Description |
|---|---|---|
| `path` | file path | The markdown file to update |
| `field` | frontmatter key | Which field to set (supports dot/bracket addressing into a list) |
| `value` | any string | The value to write |

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

- [x] A conforming `@update-frontmatter` call updates the target document's
      frontmatter and the change is durable and atomic. Live-verified and
      `tests/unit/engine/schema-engine.test.ts` (write-to-temp-then-rename,
      no orphaned temp file after a successful write).
- [x] A call that violates the target's declared schema is blocked pre-write
      with a named, specific error. Live-verified and tested.
- [!] CR-10 (Render Purity, feature 15) confirms this is the only write
      surface exercised by the purity harness. Not directly checked: the
      corpus-wide purity harness itself does not exist yet (feature 42,
      wave 6, per CR-10's own known_issues).

## Dependencies

32-schema-engine (pre-write validation).

## Known Issues

See the frontmatter `known_issues` above: writes were not atomic before
this wave, fixed with write-to-temp-then-rename.
