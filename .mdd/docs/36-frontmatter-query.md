---
id: 36-frontmatter-query
title: Frontmatter Query
type: COMPONENT
path: Directives / Frontmatter Query
source_files: [src/engine/sources.ts, src/engine/frontmatter-utils.ts,
  src/engine/sources-file-utils.ts, src/engine/read-ops.ts, src/engine/pipe.ts,
  src/engine/assert/operators.ts, src/renderer/formats/tree.ts,
  src/parser/directives/render.ts]
status: complete
phase: all
last_synced: 2026-08-02
initiative: livestage
wave: livestage-wave-5
depends_on: [17-source-directives, 32-schema-engine, 20-render-formats]
tags: [F-FM-QUERY, where-clause, fields-projection, count-by, struct-capture]
known_issues:
  - "The donor's whereMatches (sources-file-utils.ts) and frontmatter-utils.ts
    existed but were never composed, exactly as the doc's own What to Build
    predicted: whereMatches only ever ran against listJson/listCsv rows, and
    frontmatter-utils only ever read one named field at a time. Closing the
    gap needed a new parseFrontmatterRow (frontmatter-utils.ts) that parses
    every top-level field into a flat row (list fields as real string arrays,
    not comma-joined strings, so .length/array predicates work), plus a new
    @list branch (sources.ts's executeFrontmatterQuery) that only activates
    when the path is a glob AND where=/fields= is given, so the existing
    directory/JSON/CSV @list behavior is untouched."
  - "`field != []` / `field == []`, the exact syntax business rule 1 and the
    doc's own example use, compares arrays by reference in real JavaScript
    and would be vacuously true/false always if evaluated as written (an
    empty array literal is never triple/loose-equal to another array
    instance). sources.ts's preprocessArrayEmptiness rewrites that idiom to
    a `.length` check before eval, scoped to the frontmatter query path only
    so whereMatches' existing generic behavior (feature 17's JSON/CSV
    where=) is unaffected."
  - "Business rule 6 (a nested-array where=, e.g. satisfies_contracts[0].status,
    must fail loudly rather than silently return a wrong answer) needed an
    explicit static check (sources.ts's NESTED_ARRAY_RE), since
    parseFrontmatterRow only captures flat top-level fields by design and a
    query against a field it flattened away would otherwise just evaluate to
    undefined and silently filter out everything, which is exactly the
    'silent wrong answer' the business rule forbids."
  - "@render's bare positional shorthand (`@render table /`, `@render tree /`,
    used throughout this doc's own API/Interface and acceptance criteria,
    and the wave-5 demo-state text) was not implemented before this feature:
    render.ts's parser only ever read `type=` from attrs, so the bare form
    silently defaulted to type=list. Fixed in
    src/parser/directives/render.ts so the positional is sugar for type=;
    this is a parser-level fix, not scoped to F-FM-QUERY specifically, but
    was required to make this feature's own acceptance criteria (and
    demo-state) actually pass as written rather than only under the verbose
    type= form."
  - "The `tree` render format (src/renderer/formats/tree.ts) was a dumb
    passthrough (wrap raw lines in a fenced block) with no breadcrumb
    grouping logic at all; business rule 7 needed a real implementation.
    Single-column data (e.g. @tree's own directory-drawing output piped
    through @render tree) still gets the original passthrough behavior, so
    this is additive, not a breaking change to the existing render format."
  - "count-by needed a matching addition to parser.ts's own separate BUILTINS
    set (pipe-stage classification happens at parse time, execution happens
    later in pipe.ts), not just pipe.ts's; missing this exact duplication
    made the first live-verification attempt fail with a shell-command-blocked
    error, since an unrecognized builtin name falls through to shell-command
    classification. Both sets carry a cross-reference comment now, but they
    remain two hand-synced literals, not a shared import (parser/ must not
    import engine/, feature 08's boundary rule)."
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

- [x] The one-line status table golden: `@list docs/*.stage where=...
      fields=... | @render table` over a 25-doc fixture corpus renders
      correctly (Wave 5 demo-state, line 633-634; accept list, line 663-665).
      Live-verified via the built CLI against a generated 25-doc fixture
      corpus (15 complete / 7 in_progress / 3 planned) at
      /tmp/ls-fmq-demo/docs, exact 3-row filtered table produced; also
      tests/unit/engine/frontmatter-query.test.ts.
- [x] Array predicates (emptiness/length) in `where` filter correctly.
      `.length` and the `!= []`/`== []` idiom both verified live and in
      tests/unit/engine/frontmatter-query.test.ts::"array-length predicate
      filters correctly" and "the != []/== [] sugar is rewritten...".
- [x] Struct capture in a loop: `@foreach` + `@read-frontmatter label=doc`
      correctly exposes `{{ doc.status }}`. Live-verified over the 25-doc
      corpus filtered to in_progress; tests/unit/engine/frontmatter-query.test.ts::"struct
      capture works inside a @foreach body...".
- [x] `count-by` produces correct aggregate counts. Live-verified (15/7/3
      exact counts, sorted most-common-first); tests/unit/engine/frontmatter-query.test.ts::"aggregates
      projected rows by field value...".
- [x] The path-tree golden: `@render tree` over projected rows groups
      correctly by breadcrumb. Live-verified over the 25-doc corpus grouped
      by wave/id; tests/unit/engine/frontmatter-query.test.ts::"column one
      groups leaves under shared prefixes...".
- [x] A nested-array query attempt via `where` fails with a pointer to the
      `@code` pattern (not a silent wrong answer). Live-verified
      (satisfies_contracts[0].status query refused with a clear warning);
      tests/unit/engine/frontmatter-query.test.ts::"a nested-array where= is
      refused with a warning...".

## Dependencies

17-source-directives (extends `@list`/`@read-frontmatter`), 32-schema-engine
(per-projected-read validation), 20-render-formats (table/tree output).

## Known Issues

None.
