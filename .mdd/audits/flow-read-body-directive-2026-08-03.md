# Data flow: read_body() sandbox builtin + @read-body directive

## Scope (confirmed with user)

Narrow: only `read_body()` and `@read-body` this build. The 4 pre-existing
undocumented sandbox builtins (`read_section`, `read_frontmatter`,
`parse_brief`, `extract_paths`) get a `[gap]` known_issues entry on
17-source-directives.md instead of a backfill in this pass.

## The gap, precisely

Neither existing mechanism gives "the whole prose body of a markdown file,
blank lines preserved, optionally scoped to one section":

- `@read` on a `.md` file (`src/engine/sources.ts:209`) reads the WHOLE
  file including frontmatter, and its raw-text path is
  `readFileSync(full, 'utf8').split('\n').filter(l => l !== '')`, which
  strips every blank line, losing paragraph structure.
- `read_section(path, headingContains)` (`readMarkdownSection`,
  `src/engine/sources.ts:287`) requires a heading match and explicitly
  returns `''` for an empty/missing needle rather than meaning "the whole
  body." Confirmed by reading its source directly.

## Design, mirroring the `@read-frontmatter`/`read_frontmatter()` precedent

Verified this precedent is real, not assumed: `@read-frontmatter` (parser:
`src/parser/directives/read-frontmatter.ts`, engine dispatch:
`src/engine/engine.ts:315` and `:520`, two sites) and `read_frontmatter()`
(sandbox builtin: `src/engine/engine-interpolate.ts:208`, ALSO duplicated
in `src/engine/conditions.ts:291` for `@if`-scope evaluation) both exist
today for the same underlying capability
(`fileHelper.frontmatterField`/`file.frontmatterField`). `read_body`
follows the identical shape:

1. **`readMarkdownBody(absPath, headingContains?)`** in `src/engine/sources.ts`,
   alongside `readMarkdownSection` (line 287). No heading: everything after
   the closing `---` frontmatter delimiter, blank lines preserved (do NOT
   route through the `.filter(l => l !== '')` path `@read` uses). With a
   heading: delegate to the existing `readMarkdownSection` logic
   unchanged, for exact behavioral parity with what `read_section()`
   already returns.
2. **`FileHelpers.readBody`** in `src/engine/file-access.ts`, alongside the
   existing `frontmatterField`/`readSection` entries (interface at line 24,
   implementation at line 84/94).
3. **`read_body` sandbox binding**, in BOTH `src/engine/engine-interpolate.ts`
   (alongside line 199's `read_section`/line 208's `read_frontmatter`) AND
   `src/engine/conditions.ts` (alongside line 274's `read_section`/line
   291's `read_frontmatter`). Missing the second site was the exact mistake
   the codebase-exploration agent made during Phase 1; the rules-exploration
   agent caught it, verified directly before trusting either.
4. **`@read-body` directive**: parser module `src/parser/directives/read-body.ts`
   (modeled on `read-frontmatter.ts`), a new `ReadBodyNode` type in
   `src/parser/types.ts`, registered in `src/parser/registry.ts`. Attributes:
   `path` (positional or `path=`), `section=` (optional, same semantics as
   the builtin's second param), `label=`, `visible=`/`silent=` (matching
   every other source-shaped directive's suppression convention, e.g.
   `@read-frontmatter`'s business rule 6 in 17-source-directives.md).
5. **Engine dispatch**, TWO sites in `src/engine/engine.ts` (line 315-area
   for markdown-rendering, line 520-area for pipe-source), matching
   `read-frontmatter`'s own two-site pattern exactly.
6. **`executeReadBody()`** in `src/engine/read-ops.ts`, alongside
   `executeReadFrontmatter` (line 53).
7. **CR-6 Fallback Totality**: `src/engine/stripper.ts`'s switch throws
   `unhandled AST node type` on anything not listed. Confirmed by reading
   the switch directly (48 lines, every existing directive type has a
   case). `case 'read-body': return ''` is mandatory, not optional, grouped
   with the other write/read directives at lines 88-100 (`read-frontmatter`
   is right there at line 95).

## Entry surfaces (each owes a live invocation at the Green Gate)

- `{{ read_body(path) }}` and `{{ read_body(path, "Heading") }}` inside
  `{{ }}` interpolation (markdown body context).
- `{{ read_body(path) }}` inside an `@if` condition (the second, easily-missed
  binding site).
- `@read-body <path> [section="..."] [label=] [visible=/silent=]` as a
  standalone directive.
- `@read-body <path> | @render type="code" /` as a pipe source (the second
  engine.ts dispatch site).

## Process boundaries

None. Synchronous, in-process, same shape as every other source directive.

## Impact / call sites

New code only; nothing existing calls into it yet, so no `findReferences`
impact sweep needed. The one thing to re-verify after landing: `README.stage`
and `project-state.stage` both currently use `read_section()` directly and
must render byte-identical after this change, since `read_section()` itself
is explicitly unchanged (only a sibling function is added).

## Consistency check

No other code computes "read a doc's body" a different way. `@read`'s
plain-text path is the closest existing thing and is deliberately left
unchanged (still line-filtered, still whole-file-including-frontmatter);
`read_body` is additive, not a replacement.
