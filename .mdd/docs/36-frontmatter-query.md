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
test_files: [tests/unit/engine/frontmatter-query.test.ts]
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
  - "[gap] src/engine/sources.ts is 431 lines (300-line size gate), already
    426 before this pass added roughly 5 net. Shared across six docs'
    source_files (17, 18, 21, 26, 35, 36), so extraction needs its own
    scoped pass with all six re-verified, not a side effect of a two-bug
    parsing/interpolation fix here."
  - "Found live while building project-state.stage, a real .stage document
    using where=/fields= scoped by --args: frontmatterRowToTabLine
    (sources.ts) rendered an object-list field (primitives,
    satisfies_contracts, integration_contracts) in a fields= table cell as
    repeated \"[object Object]\", Array.prototype.join falling back to a
    plain object's default toString. Only surfaced once the earlier fix
    made these fields real objects instead of raw strings; fixed with a
    stringifyListItem helper that renders an object item as its own
    space-separated key=value pairs."
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

Found live while building a project-state-snapshot proposal against this
project's own 48-doc corpus: `parseFrontmatterRow` mishandled two real,
common YAML shapes it was supposed to already support per its own scope
(top-level scalars and list fields). A wrapped inline-bracket array (`field:
[a, b,\n  c]`) fell through to the plain-scalar branch, and a block-list
item's continuation line (any indented line after `- ` that isn't itself
`- `-prefixed) was silently dropped rather than appended to the current
item or added as a key on an object-list entry, so `known_issues` prose
that wraps across lines truncated mid-sentence, and object-list fields
(`primitives`, `satisfies_contracts`, `integration_contracts`) never
actually became objects at all, just the first line's raw text.

Fixing the multi-line bracket-array parse surfaced two sharper edge cases
during review, both fixed: an array whose closing `]` is immediately
followed by trailing text on the same line (a comment, say) no longer
extends accumulation into later fields (bracket depth is tracked
precisely, not "does the accumulated text end with `]`"), and an array
that never closes at all falls back to a contained, single-field scalar
the moment a later line looks like a genuine new top-level field (this
parser's own convention: always flush-left), rather than silently
absorbing the rest of the frontmatter block. The same review pass found
the parallel gap in object-list continuation: a continuation line that
isn't itself `key: value`-shaped now appends to whichever key was most
recently set on that object, instead of being silently dropped.

Separately, `where=` needed a way to be parameterized by `--args`/`--var`
(F-ARGS, feature 23), since nothing let a query be scoped to a
caller-supplied id at render time. The first version of this fix
interpolated `{{ }}` into the `where=` string as TEXT before it reached
`whereMatches`' `runInNewContext` eval, treating it the same as every
other path-shaped directive attribute. That was a real, independently
PoC-confirmed vulnerability (two review passes, run live): unlike `path=`
(whose interpolated result lands in a filesystem-jail check, never
`eval`), `where=` feeds directly into unrestricted script execution with
no policy gate at all, so a crafted `--args`/`--var` value broke out of
the intended string comparison and reached the host `process` object via
a standard `node:vm` context-escape, reading environment secrets and
running arbitrary commands end to end. The same review also found that an
UNSET arg silently evaluated to an empty string, so `where="id ==
'{{ arg0 }}'"` with no `--args` (the normal case: passive PreToolUse hook
renders carry no arguments) became `id == ''`, which does not error, so
the filter silently vanished and `@list` returned every file. The
corrected design never interpolates the expression text at all: `arg0`/
`args`/`argsList`/`vars` are bound as real variables in the VM evaluation
context, exactly the way frontmatter row fields already are, so an
untrusted value is always data, never code, and an unset arg is simply an
empty string that correctly matches nothing. Syntax changed accordingly:
`where="id == arg0"`, a bare variable reference, not `where="id ==
'{{ arg0 }}'"`.

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
- `where="<expr referencing arg0/arg1/arg2/arg3/args/argsList/vars.k>"`:
  the same `--args`/`--var` values F-ARGS (feature 23) exposes elsewhere as
  `{{ }}` interpolation, bound instead as real variables in the `where=`
  evaluation scope (never text-interpolated into the expression itself),
  so a query can be scoped to a caller-supplied id at render time.

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
8. A list-typed field written as a multi-line inline-bracket array (the
   opening `[` and closing `]` on different physical lines) parses as the
   same real array a single-line form would, not a truncated scalar; a
   closing `]` followed by trailing text on the same line never extends
   accumulation into later fields, and an array that never closes falls
   back to a contained, single-field scalar rather than absorbing the
   rest of the frontmatter block.
9. A block-list item's text that wraps across multiple physical lines is
   preserved in full, not cut off at the wrap; an object-shaped block-list
   entry (`- key: value` followed by indented `key2: value2` lines)
   parses as a real object with every key, not just the first line's, and
   a continuation line that isn't itself `key: value`-shaped appends to
   the most recently set key rather than being dropped.
10. `where=` clauses bind `arg0`/`arg1`/`arg2`/`arg3`/`args`/`argsList`/
    `vars` as real variables in the evaluation scope (F-ARGS, feature 23),
    the same values `{{ }}` interpolation exposes elsewhere, but never
    text-interpolated into the expression itself: `where="id == arg0"`,
    not `where="id == '{{ arg0 }}'"`. An unset arg is an empty string, so
    a query referencing it correctly matches nothing rather than silently
    matching everything.

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
- [x] A `source_files`-shaped field written as a multi-line inline-bracket
      array parses as the full, correct array (regression case: this
      project's own `13-cli-router.md`). Live-verified against the real
      corpus (all 7 files present) and
      tests/unit/engine/frontmatter-query.test.ts.
- [x] A closed inline array followed by trailing text on the same line
      does not extend accumulation into later fields, and an unclosed
      array falls back to a contained scalar without swallowing later
      fields. tests/unit/engine/frontmatter-query.test.ts (2 tests).
- [x] A `known_issues`-shaped entry whose quoted text wraps across
      multiple physical lines parses as the complete, untruncated string
      (regression case: this project's own `22-pipe.md`). Live-verified
      against the real corpus and
      tests/unit/engine/frontmatter-query.test.ts.
- [x] A `primitives`-shaped block-list-of-objects field parses each entry
      as a real object with every key present, not just the first line's;
      a non-`key: value` continuation line under an object item appends
      to the last key set rather than being dropped.
      tests/unit/engine/frontmatter-query.test.ts (2 tests).
- [x] `where="id == arg0"` rendered with `--args "<id>"` matches
      correctly via a bound variable, not text interpolation; the
      identical hardcoded literal continues to match identically; an
      unset arg matches nothing, never silently matches everything.
      Live-verified against the real corpus and
      tests/unit/engine/frontmatter-query.test.ts (3 tests).
- [x] A crafted `--args` value cannot break out of a `where=` comparison
      to execute code (the PoC from review, confirmed inert). Live-verified
      against the real corpus with both the boolean-bypass and the
      process-escape payloads from the security review, and
      tests/unit/engine/frontmatter-query.test.ts.
- [x] The new multi-line array and object-list shapes work through the
      full `@list where=/fields=` pipeline, not just direct
      `parseFrontmatterRow` calls. tests/unit/engine/frontmatter-query.test.ts.

## Dependencies

17-source-directives (extends `@list`/`@read-frontmatter`), 32-schema-engine
(per-projected-read validation), 20-render-formats (table/tree output).

## Known Issues

See the frontmatter `known_issues` above: `src/engine/sources.ts` is over
the 300-line size gate, pre-existing and shared across six docs, flagged
as a `[gap]` rather than fixed here. Everything else found during this
pass (the bracket-array/block-list parsing edge cases and the `where=`
interpolation vulnerability) was fixed within the same build; see
Implementation Notes for the full narrative and Business Rules 8-10 for
the resulting behavior.
