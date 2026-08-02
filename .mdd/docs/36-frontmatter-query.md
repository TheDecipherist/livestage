---
id: 36-frontmatter-query
title: Frontmatter Query
type: COMPONENT
path: Directives / Frontmatter Query
source_files: [src/engine/sources.ts, src/engine/frontmatter-utils.ts]
status: planned
phase: idle
last_synced: 2026-08-01
initiative: livestage
wave: livestage-wave-5
depends_on: [17-source-directives, 32-schema-engine, 20-render-formats]
tags: [F-FM-QUERY, where-clause, fields-projection, count-by, struct-capture]
known_issues: []
---

# Frontmatter Query

## What to Build

`[new; donor whereMatches + frontmatter-utils, composed - neither wired to
the other in the donor]`. Frontmatter-aware document querying, F-FM-QUERY, in
four parts:

1. `@list docs/*.stage where="status != 'complete' && known_issues != []"
   fields="id,status,wave,last_synced"`: the `where` clause evaluates
   against each matched file's frontmatter, arrays support
   emptiness/length predicates, `fields=` projects frontmatter columns as
   rows for `| @render table`.
2. `@read-frontmatter path=... label=doc` struct mode: all fields captured,
   `{{ doc.status }}` dot-access inside loops.
3. `count-by <field>` pipe builtin over projected rows (e.g. "complete 18,
   in_progress 4").
4. `@render tree` over projected rows: column one (a slash-delimited
   breadcrumb like `path`) is the tree key, remaining columns annotate the
   leaf.

## Architecture

Extends feature 17's `@list`/`@read-frontmatter` with the frontmatter-aware
`where`/`fields`/struct-capture machinery, schema-validated per projected
read (feature 32), and renders via feature 20's table/tree formats.

## Implementation Notes

This directly replaces a class of generated file: "the classic status table
becomes ONE line instead of a 100-execution `@foreach`" (line 653-654).
Cross-doc queries into NESTED frontmatter arrays (e.g. contract objects) are
deliberately NOT a directive; that is a documented `@code` pattern in the
user guide (feature 45), not something this component attempts to support
(line 658-660).

## Data Model

Projected row: one row per matched document, columns = the `fields=` list,
each value read from that document's schema-validated frontmatter.

## API/Interface

- `@list <glob> where="<expr>" fields="a,b,c" | @render table` (line
  650-654).
- `@read-frontmatter path=... label=doc` (struct mode; `{{ doc.status }}`
  dot-access) (line 655-656).
- `count-by <field>` pipe builtin (line 656-657).
- `@render tree` over projected rows (path-tree view) (line 660-662).

## Business Rules

1. `where` evaluates against each matched file's frontmatter; array
   predicates support emptiness/length checks (line 650-652).
2. `fields=` projects frontmatter columns as rows for `@render table`
   (line 652-653).
3. `@read-frontmatter ... label=doc` struct mode captures all fields;
   `{{ doc.status }}` dot-access works inside loops (line 655-656).
4. `count-by <field>` aggregates projected rows by field value (line
   656-657).
5. Schema validation (F-SCHEMA, feature 32) applies to every projected read
   (line 657).
6. Nested-array frontmatter queries via `where` are NOT supported; they are
   the documented `@code` pattern instead (line 658-660).
7. `@render tree` over projected rows uses column one (a slash-delimited
   breadcrumb like `path`) as the tree key, remaining columns annotate the
   leaf (line 660-662).

## Acceptance Criteria

- [ ] The one-line status table golden: `@list docs/*.stage where=...
      fields=... | @render table` over a 25-doc fixture corpus renders
      correctly (Wave 5 demo-state, line 633-634; accept list, line 663-665).
- [ ] Array predicates (emptiness/length) in `where` filter correctly.
- [ ] Struct capture in a loop: `@foreach` + `@read-frontmatter label=doc`
      correctly exposes `{{ doc.status }}`.
- [ ] `count-by` produces correct aggregate counts.
- [ ] The path-tree golden: `@render tree` over projected rows groups
      correctly by breadcrumb.
- [ ] A nested-array query attempt via `where` fails with a pointer to the
      `@code` pattern (not a silent wrong answer).

## Dependencies

17-source-directives (extends `@list`/`@read-frontmatter`), 32-schema-engine
(per-projected-read validation), 20-render-formats (table/tree output).

## Known Issues

None.
