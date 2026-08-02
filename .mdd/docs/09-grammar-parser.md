---
id: 09-grammar-parser
title: Grammar Parser
type: COMPONENT
path: Parser / Grammar
source_files: [src/parser/index.ts, src/parser/types.ts, src/parser/args.ts, src/parser/grammar.ts]
status: planned
phase: idle
last_synced: 2026-08-01
initiative: livestage
wave: livestage-wave-1
depends_on: [07-package-skeleton]
tags: [grammar, ast, directive-registry, frontmatter, self-closing, block-directive]
known_issues: []
---

# Grammar Parser

## What to Build

`[verify]`, copy from `~/projects/markdownai/packages/parser/src/*`. The v2
grammar, unchanged from the donor, parsing `.stage` text into an AST against
exactly the directive registry the spec authorizes (no more). Three directive
forms must parse: self-closing (`@hash path="..." /`), block with attributes
(`@render ... @render-end`), block with attributes plus body
(`@if {{ x }} > ... @if-end`). Close tags carry the directive name. YAML
frontmatter is optional; the optional engine version pin is frontmatter
`livestage: 1` (no header directive exists).

## Architecture

The foundation every directive-owning COMPONENT (sources, compute,
composition, assert, code, ...) builds on: they each register a directive
parser here and get resolution behavior from the engine. `include`/`import`/
`template` resolve `.stage` files relative to the including document, subject
to filesystem policy.

## Implementation Notes

Donor v2 grammar is unchanged (`[seeded]`, line 316) - this is a copy-first
verification task, not new grammar design. The directive registry is
authoritative and closed: nothing outside it ever parses (line 329,
353-361). A document containing a retired donor directive (`phase`,
`on-complete`, `event`, `gate`, `persist`, `prompt`, `section`,
`chunk-boundary`, `constraint`, `define-concept`, `note`, `plugin-*`,
`header`, `touch`, `mkdir`, `copy`, `append-if-missing`, `render-template`,
`db`, `connect`, `http`) must fail as an unknown directive, not be silently
skipped.

## Data Model

AST node per directive occurrence carrying: directive name, kind (source /
compute / comp / render / write / fm), attributes (parsed key=value pairs,
values may contain `{{ }}` interpolation expressions), body (for block
directives), and source position (line, for error messages and trace
records).

## API/Interface

`livestage parser ast|check|directives|imports|macros` (line 526,
seeded: `list-imports`/`list-macros`) exposes the parser directly for
debugging.

## Business Rules

1. Three directive forms only: self-closing, block-with-attributes,
   block-with-attributes-and-body (line 317-318).
2. Close tags carry the directive name (line 318).
3. YAML frontmatter is optional; `livestage: 1` is the only recognized
   version pin, no separate header directive exists (line 319-320).
4. The directive registry (spec table, lines 331-351) is the complete,
   authoritative set; nothing else parses (line 329).
5. A document containing a directive outside the registry fails as an unknown
   directive (line 353-355, 610-611).

## Acceptance Criteria

- [ ] All three directive forms parse correctly against donor-copied fixture
      tests.
- [ ] Frontmatter is optional and, when present with `livestage: 1`, is read
      as the version pin.
- [ ] Every directive in the registry table parses; every excluded donor
      directive name fails as unknown.
- [ ] `parser ast|check|directives|imports|macros` subcommands each produce
      correct output against a fixture doc.

## Dependencies

07-package-skeleton.

## Known Issues

The donor's `@template`/`@data` partial interaction with `@foreach` scoping is
covered by copied tests, but the `.stage` re-extension of executable fixtures
must be verified early (spec line 861-862, Known gaps) - flagged here since
the grammar parser is what consumes those fixtures first.
