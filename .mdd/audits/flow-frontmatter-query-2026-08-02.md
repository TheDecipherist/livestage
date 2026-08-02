# Data flow: F-FM-QUERY parsing/interpolation fixes (amends 36-frontmatter-query)

## Scope (confirmed with user)

- Amend `36-frontmatter-query.md` in place, not a new doc.
- Fix `where=` interpolation only in the frontmatter-query path
  (`executeFrontmatterQuery`), not `listJson`/`listCsv`'s `where=` (feature
  17 territory, left as a `[gap]` known_issue for that doc instead).
- `readFrontmatterField`'s analogous block-list-continuation bug (used by
  single-field `@read-frontmatter`, feature 17) is the same bug shape but a
  different function; out of scope here, recorded as a `[gap]` known_issue
  on `17-source-directives` instead of fixed in this build.

## The three defects, traced to source

### Bug 1: multi-line inline-bracket arrays (`parseFrontmatterRow`)

`src/engine/frontmatter-utils.ts:94`:
```js
if (rest.startsWith('[') && rest.endsWith(']')) { ... }
```
Requires both brackets on the same physical line. A wrapped array (10 of 48
real docs in this corpus, e.g. `13-cli-router.md`'s `source_files`) falls
through to the plain-scalar branch at line 99, producing a garbled,
truncated string instead of an array.

**Fix**: when `rest` starts with `[` but doesn't end with `]`, accumulate
subsequent lines (trimmed, space-joined) until one ends with `]`, then
parse the accumulated inner text the same way the single-line case already
does. Advance the outer loop index past the consumed lines.

### Bug 2: block-list continuation drops data (`parseFrontmatterRow`)

`src/engine/frontmatter-utils.ts:103-117`. The loop only accepts lines
matching `/^\s+-\s/`; any other indented line is silently skipped, neither
appended nor erroring. Two real symptoms, one root cause:

- A `known_issues` entry whose quoted-string text wraps across lines (very
  common in this corpus) gets truncated mid-sentence; the continuation
  text vanishes.
- A block-style list-of-objects entry (`primitives`, `satisfies_contracts`,
  `integration_contracts`), e.g. `- name: "@list"` followed by an indented
  `kind: directive`, never actually becomes an object at all today: each
  `- ` line is pushed as a raw string (`'name: "@list"'`), and the
  continuation line is dropped outright. Confirmed live: a corpus-wide
  query showed `primitives` values like `name: "@list", name: "@read"`,
  raw unparsed strings, not `{name, kind}` objects.

**Fix**: track whether the current list item is a plain scalar (its `- `
line is not itself `key: value`-shaped) or an object opener (`- key:
value`). For a scalar item, accumulate continuation lines into the same
string and unquote once at the end. For an object item, a continuation
line matching `key: value` becomes an additional key on that item's
object; anything else under an object item is skipped (matches today's
"out of scope: nested objects" boundary, doesn't regress).

### Bug 3: `where=` never interpolates `{{ }}` (`executeFrontmatterQuery`)

`src/engine/sources.ts:80-108`. `args['where']` is read and used directly;
nothing calls `interpolatePathSoft` (already imported in this file, used
for path resolution) on it first. Confirmed live: a hardcoded
`where="id == '17-source-directives'"` matches correctly; the identical
clause with `{{ arg0 }}` in place of the literal returns zero rows, not an
error, a silent full-corpus miss.

**Fix**: interpolate `rawWhere` through `interpolatePathSoft(rawWhere,
ctx)` before the `NESTED_ARRAY_RE` check and `preprocessArrayEmptiness`,
mirroring exactly how `path=`/`command=` already get interpolated
elsewhere in this same file. No new import needed.

## Entry surfaces (each owes a live invocation at the Green Gate)

- `@list <glob> where=... fields=...` (the whole point of feature 36),
  invoked via `livestage render`/`livestage build`.
- `@list <glob> where="... {{ arg0 }} ..."` invoked with `livestage render
  doc.stage --args "<id>"`, the new capability Bug 3's fix unlocks.
- `@graph` and `@read-frontmatter`'s struct-capture mode both call
  `parseFrontmatterRow` (via `graph.ts:59` and `read-ops.ts:87`); Bug 1/2's
  fix changes what they see for any doc with a multi-line array or a
  wrapped/object-list field, so both need a live re-check, not just a unit
  test, since neither one is this build's own new code.

## Process boundaries

None. Everything here is synchronous, in-process (file read, VM eval for
`whereMatches`, string interpolation). No spawned child, no hook boundary.

## Impact / call sites (LSP `findReferences`, not grep, for exactness)

- `parseFrontmatterRow`: `executeFrontmatterQuery` (sources.ts),
  `executeReadFrontmatter` (read-ops.ts:87, `@read-frontmatter`'s
  `label=`/struct mode), `executeGraph` (graph.ts:59, relation-field
  validation). All three inherit Bug 1/2's fix automatically; all three
  need a live re-verification pass, not just this feature's own tests.
- `whereMatches`: `executeFrontmatterQuery` (this fix's target),
  `listJson`, `listCsv` (both out of scope per the confirmed decision,
  their `where=` stays uninterpolated for now).
- `interpolatePathSoft`: already used elsewhere in `sources.ts`
  (`resolveDataPath`, `executeQuery`'s command interpolation); adding one
  more call site is a established, low-risk pattern in this file already.

## Consistency check

No other code computes the same concept a different way. The bug is
localized to one shared parsing/matching pair; no divergent duplicate
implementation found.
