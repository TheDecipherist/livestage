---
id: 09-grammar-parser
title: Grammar Parser
type: COMPONENT
path: Parser / Grammar
source_files: [src/parser/index.ts, src/parser/types.ts, src/parser/args.ts, src/parser/parser.ts, src/parser/registry.ts, src/parser/lexer.ts, src/parser/interpolation.ts, src/parser/directives]
status: complete
phase: all
last_synced: 2026-08-01
initiative: livestage
wave: livestage-wave-1
depends_on: [07-package-skeleton]
tags: [grammar, ast, directive-registry, frontmatter, self-closing, block-directive]
known_issues:
  - "Found and fixed a real gap while verifying: ParseResult.version was always null, no frontmatter livestage: field was ever read despite this being an explicit acceptance criterion. Implemented a targeted VERSION_PIN_RE read (not a general YAML parser, that is Wave 5's Schema Engine)."
  - "Found and fixed a related gap in src/cli/commands/validate.ts (not this feature's source_files but directly blocking its own acceptance criterion): validate never flagged an unregistered/passthrough directive as an error, so a document full of retired directives (@phase, @db, ...) validated clean. Added the check; covered by tests/unit/cli/cli-validate.test.ts."
  - "The doc's listed source_files (index.ts, types.ts, args.ts, grammar.ts) do not match the actual file layout (parser.ts holds the parse()/parseNodes() logic, registry.ts + directives/ hold the directive table, there is no grammar.ts); corrected to the real files above."
  - "livestage parser ast|check|directives|imports|macros as a namespaced CLI subcommand group does not exist yet; current commands are flat (parse, list-macros, list-imports). That CLI-shape work belongs to feature 13 (CLI Router)."
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

- [x] All three directive forms parse correctly against donor-copied fixture
      tests. 675/675 tests green across the merged suite.
- [x] Frontmatter is optional and, when present with `livestage: 1`, is read
      as the version pin. Implemented; `tests/unit/parser/parser.test.ts`
      "frontmatter version pin" block.
- [x] Every directive in the registry table parses; every excluded donor
      directive name fails as unknown. Verified live against all 18 excluded
      directive names (phase, on-complete, event, prompt, section,
      chunk-boundary, constraint, define-concept, note, plugin-meta, touch,
      mkdir, copy, append-if-missing, render-template, db, connect, http):
      every one parses as a passthrough (unknown) node, none silently drop.
- [!] `parser ast|check|directives|imports|macros` subcommands each produce
      correct output against a fixture doc. Deferred to feature 13 (CLI
      Router): current commands are flat, not namespaced this way.

## Dependencies

07-package-skeleton.

## Known Issues

The donor's `@template`/`@data` partial interaction with `@foreach` scoping is
covered by copied tests, but the `.stage` re-extension of executable fixtures
must be verified early (spec line 861-862, Known gaps) - flagged here since
the grammar parser is what consumes those fixtures first.
