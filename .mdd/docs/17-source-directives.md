---
id: 17-source-directives
title: Source Directives
type: COMPONENT
path: Directives / Sources
source_files: [src/parser/directives/list.ts, src/parser/directives/read.ts, src/parser/directives/read-frontmatter.ts, src/parser/directives/read-body.ts, src/parser/directives/tree.ts, src/parser/directives/count.ts, src/parser/directives/date.ts, src/parser/directives/env.ts, src/parser/types.ts, src/parser/registry.ts, src/engine/sources.ts, src/engine/read-ops.ts, src/engine/engine.ts, src/engine/engine-interpolate.ts, src/engine/conditions.ts, src/engine/file-access.ts, src/engine/stripper.ts, src/engine/macros.ts]
test_files: [tests/unit/engine/read-body.test.ts, tests/golden/markdown-out.test.ts, tests/golden/deterministic-snapshots.test.ts, tests/unit/engine/fallback-registry.test.ts]
status: complete
phase: all
last_synced: 2026-08-03
initiative: livestage
wave: livestage-wave-2
depends_on: [09-grammar-parser, 11-extension-routing, 10-security-policy-core]
tags: [list, read, read-frontmatter, read-body, tree, count, date, env, filesystem-policy]
data_flow: .mdd/audits/flow-read-body-directive-2026-08-03.md
known_issues:
  - "source_files sources.ts and read-ops.ts are shared with feature 18 (Compute Directives): @query's engine implementation (executeQuery) lives in sources.ts, and @hash's (executeHash) lives in read-ops.ts, not in 18's own exec-ops.ts. The donor organized these engine modules by cohesion, not by strict per-directive file boundaries; corrected here and cross-referenced in 18's known_issues rather than moved."
  - "RESOLVED (2026-08-02, found while building feature 48, Auto README Generation): @read-frontmatter did not honor visible=/silent=, the only source-shaped directive that was missed when @list/@read/@tree/@code all got this suppression convention. Fixed in src/engine/engine.ts's case 'read-frontmatter' to match the existing case 'list'/'read'/'tree' pattern: visible=\"false\" or silent=\"true\" suppresses inline output while label= still captures the value. Purely additive, every existing call site in the repo (grepped: 11 files across examples/tests/docs) omits both attrs and is unaffected. tests/unit/engine/read-frontmatter.test.ts covers both attributes plus a default-unchanged regression check."
  - "[gap] read_section, read_frontmatter, parse_brief, and extract_paths
    (the pre-existing {{ }}/@if sandbox builtins in engine-interpolate.ts
    and conditions.ts) are real, tested, production capabilities with zero
    primitives documentation anywhere in the corpus. Found while adding
    read_body/@read-body in the same family. Backfilling them needs its
    own scoped pass, not a side effect of this build."
  - "[gap] B1: executeQuery (sources.ts) resolves {{ }} via
    interpolatePathSoft into command= BEFORE checkShellCommand runs, so a
    resolved value containing shell metacharacters (;, &&, |, backticks,
    $()) passes the allowlist check as part of an allowed match (see
    10-security-policy-core B1 for the matching-logic root cause) and is
    then executed by execSync with a real shell, arbitrary command
    chaining after an allowed prefix. Found 2026-08-03, scoped 2026-08-17.
    See 18-compute-directives B1 (same pattern in executeTest/
    executeCheck) and 22-pipe B1 (runShell)."
primitives:
  - name: "@list"
    kind: directive
  - name: "@read"
    kind: directive
  - name: "@read-frontmatter"
    kind: directive
  - name: "@tree"
    kind: directive
  - name: "@count"
    kind: directive
  - name: "@date"
    kind: directive
  - name: "@env"
    kind: directive
  - name: "read_body"
    kind: sandbox-builtin
  - name: "@read-body"
    kind: directive
satisfies_contracts:
  - from: 10-security-policy-core
    function: checkDataPath
    when: always
    status: done
    verified_at: "tests/unit/engine/source-data-root.test.ts::paths above data root are blocked (path traversal)"
  - from: 10-security-policy-core
    function: checkShellCommand
    when: always
    status: done
    verified_at: "tests/unit/engine/query-policy.test.ts::is blocked when the command is not in allow_patterns, even with allowShell true"
  - from: 10-security-policy-core
    function: checkWritePath
    when: "filesystem.write_enabled is true"
    status: done
    verified_at: "tests/unit/engine/source-directives-purity.test.ts::rendering every source directive leaves the directory snapshot unchanged"
---

# Source Directives

## What to Build

`[verify]`, copy from
`~/projects/markdownai/packages/parser/src/directives/*` and
`packages/engine/src/*`. `@list`, `@read`, `@read-frontmatter`, `@tree`,
`@count`, `@date`, `@env`: the directives that pull raw data from the
filesystem, structured files, and the environment.

## Interface Overview

These directives (plus one sandbox function for composing content inline)
are how a `.stage` document reads the real world: the filesystem,
structured JSON/CSV files, another document's frontmatter or body text,
and the environment. Reach for one of these any time you'd otherwise write
a paragraph by hand and hope it stays accurate, a file listing, a value
pulled out of `package.json`, the current date, a config value from the
environment. Every read is live: run the same document again later and it
answers again, from whatever is true then.

| Name | What it does |
|---|---|
| `@list` | Lists files in a directory, or rows from a JSON array or CSV file. |
| `@read` | Reads a file's raw content, or one value/table out of a JSON or CSV file. |
| `@read-frontmatter` | Reads one field out of a markdown file's YAML frontmatter. |
| `@read-body` | Reads a markdown file's whole body, or one section of it, past the frontmatter. |
| `@tree` | Renders a directory as an indented tree. |
| `@count` | Counts files in a directory, or lines in a file. |
| `@date` | The current date/time, or a file's last-modified time, in a format you choose. |
| `@env` | An environment variable, with an optional fallback. |
| `read_body` | The same read as `@read-body`, callable inline inside `{{ }}` or `@if` for composing into a larger expression. |

### @list

Lists the entries in a directory, or reads rows out of a JSON array or a CSV
file when the path ends in `.json`/`.csv`.

```stage
@list "src" match="*.ts" type="files" /
```

| Parameter | Values | Description |
|---|---|---|
| `match` | glob pattern | Only include entries whose name matches |
| `type` | `files` \| `dirs` \| `both` (default `files`) | What kind of entries to include |
| `depth` | integer | How many directory levels to recurse (unlimited if omitted) |
| `path` | dot-path (JSON only) | Pull one nested value or array out of a JSON file instead of listing its top level |
| `columns` | `col1,col2` (JSON/CSV) | Which fields to show, in order, for array/row data |
| `where` | expression | Keep only rows/items matching the expression |
| `column` | name (CSV only) | Return a single column instead of full rows |
| `label` | name | Capture the result into a variable instead of (or as well as) printing it |

### @read

Reads a file's content as-is, or pulls one value or table out of a JSON or
CSV file when `path=`/`column=` is given.

```stage
@read "package.json" path="name" /
```

| Parameter | Values | Description |
|---|---|---|
| `path` | dot-path (JSON only) | Extract one nested value out of a JSON file |
| `columns` | `col1,col2` (JSON/CSV) | Which fields to show, in order |
| `where` | expression | Keep only rows/items matching the expression |
| `column` | name (CSV only) | Return a single column instead of full rows |
| `label` | name | Capture the result into a variable |
| `visible` / `silent` | `false` / `true` | Suppress the inline print, useful when only the captured `label=` value is needed |

### @read-frontmatter

Reads one named field out of a markdown file's YAML frontmatter block,
useful for pulling a doc's `status`, `title`, or any other frontmatter value
into a render without opening the file yourself.

```stage
@read-frontmatter "README.stage" field="title" label="doc_title" visible="false" /
{{ doc_title }}
```

| Parameter | Values | Description |
|---|---|---|
| `field` | frontmatter key | The single top-level field to read (arrays come back comma-joined) |
| `label` | name | Capture the value into a variable |
| `visible` / `silent` | `false` / `true` | Suppress the inline print, keep only the captured value |

### @read-body

Reads a markdown file's whole body, everything after its frontmatter
block, blank lines preserved, as a standalone directive: prints inline,
captures via `label=`, or feeds into a pipe. Give it `section=` to get
just one part of the doc instead of the whole thing.

```stage
@read-body ".mdd/docs/17-source-directives.md" section="Business Rules" | @render type="code" lang="markdown" /
```

| Parameter | Values | Description |
|---|---|---|
| (positional) or `path` | file path | The markdown file to read |
| `section` | heading text | Return just this one section instead of the whole body |
| `label` | name | Capture the result into a variable |
| `visible` / `silent` | `false` / `true` | Suppress the inline print, keep only the captured value |

### @tree

Renders a directory as an indented tree, the same shape as the Unix `tree`
command.

```stage
@tree "src" depth="2" /
```

| Parameter | Values | Description |
|---|---|---|
| `match` | glob pattern | Only include entries whose name matches |
| `depth` | integer | How many levels to recurse (unlimited if omitted) |

### @count

Counts the files in a directory (optionally filtered by `match=`), or the
lines in a file.

```stage
@count "src" match="*.ts" /
```

| Parameter | Values | Description |
|---|---|---|
| `match` | glob pattern | Only count entries whose name matches |
| `type` | `files` \| `dirs` \| `both` (default `files`) | What kind of entries to count |

### @date

The current date and time, or a file's last-modified time, in a format you
choose.

```stage
@date format="YYYY-MM-DD" /
```

| Parameter | Values | Description |
|---|---|---|
| `format` | `ISO`, `date`, or a token pattern (`YYYY-MM-DD HH:mm`, etc.) | How to format the result (default `ISO`) |
| `type` | `current` (default) \| `modified` | Use now, or a file's last-modified time |
| `file` | path | The file to read the modified time from, when `type="modified"` |

### @env

Reads an environment variable, with an optional fallback when it isn't set.

```stage
@env "NODE_ENV" fallback="development" /
```

| Parameter | Values | Description |
|---|---|---|
| (positional) | variable name | The environment variable to read |
| `fallback` | any string | Value to use when the variable isn't set |

### read_body

A sandbox function, callable inside `{{ }}` or an `@if` condition, that
returns a markdown file's whole body, everything after its frontmatter
block, blank lines preserved. Give it a heading and it returns just that
one section instead, the same result `read_section()` already returns.
Reach for this when you're composing a doc's own content into a larger
expression, the same way `README.stage` chains `.replace()` onto
`read_section()`'s result today.

```stage
{{ read_body(".mdd/docs/17-source-directives.md") }}
{{ read_body(".mdd/docs/17-source-directives.md", "Architecture") }}
```

| Parameter | Values | Description |
|---|---|---|
| `path` | file path | The markdown file to read (first argument) |
| `section` | heading text (optional) | Return just this one section instead of the whole body (second argument) |

## Architecture

Every filesystem or env access these directives make must resolve through
feature 10's `enforcePolicy` gate (declared as an `integration_contracts`
provider there); this component is a `satisfies_contracts` dependent.

## Implementation Notes

`@list`'s `where` filters STRUCTURED rows only in the seed; frontmatter-aware
`where` and `fields=` projection over document globs is F-FM-QUERY, deferred
to feature 36 (Wave 5). `@read-frontmatter`'s seeded form reads ONE top-level
field per call, arrays comma-joined; multi-field struct capture
(`label=doc` -> `{{ doc.status }}`) is also F-FM-QUERY.

## Data Model

N/A (each directive's output shape is the raw/structured data it reads;
schema validation of frontmatter reads is owned by feature 32).

## API/Interface

| Directive | Key attrs | Behavior |
|---|---|---|
| `@list` | glob/`match`/`type`/`depth` (filesystem), `path`/`mode` (JSON), `columns`+`where` (structured rows), `label`, `as=` | files, dirs, JSON array/object items, CSV rows |
| `@read` | `file`, `path=` (dot-notation, JSON/YAML/TOML), `column=`+`where=` (CSV), `key=` (.env) implemented but unreachable, see Known Issues), `label`, `as=` | raw file content, or a value/table extracted from structured files |
| `@read-frontmatter` | `path`, `field` (single, seeded) | schema-validated (F-SCHEMA); reads ONE top-level field per call, arrays comma-joined |
| `@read-body` | `path`, `section=` (optional), `label`, `visible`/`silent` | markdown file's whole body past the frontmatter, or one section |
| `@tree` / `@count` | path/glob | tree render / count |
| `@date` / `@env` | format / `fallback` | now / env value; `@env` has no `masked` attribute. A resolved secret-shaped value is masked before it is written to cache (`cache.ts`) or a trace record (`engine.ts`'s `applyMasking` on directive args), never in the primary render/stdout output, which shows the value the caller explicitly requested |
| `read_body` (sandbox function) | `path`, `section` (optional) | same result as `@read-body`, callable inside `{{ }}`/`@if` |

## Business Rules

1. `@read`'s access option is expected to match the file format. RESOLVED
   (2026-08-02, post-initiative known_issues sweep): a mismatched option
   (e.g. `column=` against JSON, `path=` against CSV, any structured option
   against a plain file) now pushes a named warning identifying the option
   and the actual file kind, rather than silently falling through with no
   signal at all. Still not a hard error, matching this directive's
   established degrade-with-a-warning contract rather than a crash; the
   read itself still completes (raw content for a non-structured file, the
   correctly-typed structured read when the file DOES match one of the two
   supported kinds, just the extra option ignored). See Known Issues.
2. `@read-frontmatter`'s seeded form reads exactly one top-level field per
   call; arrays are comma-joined (line 335).
3. `@list`'s `where` filters structured rows only in the seed; frontmatter-
   aware `where` is not yet supported (deferred to feature 36) (line 333).
4. `@read`'s `key=` reads a named value from a `.env` file (`readEnvFile` in
   `sources.ts`), but `.env*`/`*.env` sits in the immutable
   `FILESYSTEM_ALWAYS_BLOCK_PATTERNS` list, so this path never actually
   executes; the sanctioned way to reach an env value is `@env NAME` backed
   by the CLI's `--env <file>` loader (feature 13), not a direct file read.
5. All filesystem access resolves through the security policy (feature 10),
   including path traversal checks.
6. `@read-frontmatter` honors `visible="false"`/`silent="true"` the same way
   `@list`/`@read`/`@tree`/`@code` do: suppresses inline output, `label=`
   still captures the value (RESOLVED 2026-08-02, see known_issues).
7. `read_body(path, section?)` and `@read-body <path> [section=]` return a
   markdown file's whole body (everything after the closing frontmatter
   delimiter), blank lines preserved; with a heading given, they return
   exactly what `read_section()`'s existing section-extraction returns,
   so the two mechanisms never disagree on the same input.
8. `read_body` is bound as a sandbox function in THREE places: `{{ }}`
   interpolation (`engine-interpolate.ts`), `@if` condition evaluation
   (`conditions.ts`), and macro/`@foreach` body substitution
   (`macros.ts`'s `substituteNode`), matching how `read_frontmatter` is
   bound; a builtin added to only the first two throws `unhandled AST
   node type` the moment it appears inside a `@foreach` or `@call` body,
   found live during Phase 7 review (`@read-body path="{{ x }}" /` inside
   `@foreach x in @list ...`) and fixed before this doc closed.
9. `@read-body` degrades to an empty string under a stripped/degraded
   render (`stripper.ts`), the same fallback contract every other source
   directive has (CR-6, Fallback Totality).
10. `read_body`/`@read-body` normalize CRLF line endings before stripping
    frontmatter: the shared `FRONTMATTER_RE` (`frontmatter-utils.ts`) is
    LF-only, so a Windows-authored file's frontmatter block silently
    failed to match and got emitted whole as "body" (credentials
    included). Fixed in `readMarkdownBody` specifically since it is the
    first whole-file-content reader on this path; `read_frontmatter`'s
    field-scoped reads are unaffected by the same root cause since a miss
    there returns nothing rather than everything.
11. An explicitly-empty `section=`/second `read_body` argument is NOT the
    same as omitting it: omitted means "whole body," explicitly empty
    delegates to `read_section()`'s own empty-heading miss behavior (`''`),
    exact parity per rule 7. A section that matches no heading warns
    (`no heading matching "..." in <path>`) instead of returning an
    indistinguishable empty string, matching `@read-frontmatter`'s
    warn-on-miss convention.
12. A blocked or alert-classified path reached through the sandbox
    functions (`read_body`/`read_section`/`read_frontmatter`, via
    `file-access.ts`'s shared `confined()` helper) now pushes the same
    `SECURITY_ALERT` warning the `@read-body`/`@read-frontmatter`
    directive path already pushed via `resolveReadPath`; previously a
    jail-escape attempt through the sandbox path left no warning at all,
    a silent audit-trail gap found during Phase 7 security review and
    closed for every helper that shares `confined()`, not only
    `read_body`.

## Acceptance Criteria

- [x] Each of `@list`, `@read`, `@read-frontmatter`, `@tree`, `@count`,
      `@date`, `@env` renders correctly against donor-copied fixture tests:
      `tests/unit/cli/cli-sources.test.ts` (14), `tests/unit/engine/source-
      data-root.test.ts` (17), `source-label-multiline.test.ts` (6), `read-
      frontmatter.test.ts` (8).
- [x] `@read` against a wrongly-matched access option (e.g. `column=` on a
      non-CSV file) warns, naming the option and the actual file kind,
      instead of silently falling through with no signal. Live-verified;
      tests/unit/cli/cli-sources.test.ts's three mismatch tests plus one
      proving a clean (no mismatched option) read against a plain file
      stays silent.
- [x] A `@list`/`@read`/`@query` call outside the granted filesystem/shell
      policy is blocked: `checkDataPath` via `source-data-root.test.ts`,
      `checkShellCommand` via `query-policy.test.ts`.
- [x] Secret-shaped values are masked before cache and trace persistence
      (never in the primary render output, which shows what the caller
      explicitly requested): `tests/unit/engine/trace.test.ts`'s masking
      block, `cache.ts`'s `applyMasking` call. The literal `@env key=...`
      acceptance criterion as worded does not apply: `@env` has no `key=`
      attribute (that belongs to `@read`), and `@read`'s `.env` path is
      unreachable, see Known Issues.
- [x] `@read-frontmatter visible="false"`/`silent="true"` suppresses inline
      output while `label=` still captures the value; the default (neither
      attribute given) is unchanged. tests/unit/engine/read-frontmatter.test.ts.
- [x] `read_body(path)` inside `{{ }}` returns a markdown file's whole
      body with blank lines preserved, not the frontmatter, not
      line-filtered the way `@read`'s raw-text path is. Live-verified via
      the real CLI (`livestage build`) plus
      `tests/unit/engine/read-body.test.ts`.
- [x] `read_body(path, "Heading")` returns exactly what
      `read_section(path, "Heading")` already returns for the same input,
      including the empty-heading edge case (parity, not just the happy
      path). `tests/unit/engine/read-body.test.ts`.
- [x] `read_body(path)` also works inside an `@if` condition (the second
      binding site, `conditions.ts`) and inside a `@foreach` body (a third
      binding site, `macros.ts`'s `substituteNode`, found missing during
      Phase 7 review and fixed). Live-verified plus
      `tests/unit/engine/read-body.test.ts`.
- [x] `@read-body <path>` standalone renders the whole body inline;
      `label=`/`visible=`/`silent=` behave the same as every other source
      directive's suppression convention. Live-verified plus
      `tests/unit/engine/read-body.test.ts`.
- [x] `@read-body <path> section="..."` piped into `@render` works as a
      pipe source. Live-verified plus `tests/unit/engine/read-body.test.ts`.
- [x] A stripped/degraded render of a document containing `@read-body`
      degrades to an empty string instead of throwing (CR-6).
      `tests/unit/engine/read-body.test.ts`.

## Dependencies

09-grammar-parser, 11-extension-routing (resolution semantics),
10-security-policy-core (filesystem/env enforcement).

## Known Issues

See the frontmatter `known_issues` above: `read_section`, `read_frontmatter`,
`parse_brief`, and `extract_paths` are real, undocumented sandbox builtins
found while adding `read_body`/`@read-body` in the same family, deliberately
left out of this build's scope.

- RESOLVED (2026-08-02): `@read`'s access options are now cross-validated
  against the file's actual format (`warnUnusedOption` in `sources.ts`);
  a mismatched option warns by name instead of silently falling through.
- RESOLVED (2026-08-02): `@read-frontmatter` now honors `visible=`/`silent=`,
  matching every other source-shaped directive; see the frontmatter
  `known_issues` above for the mechanism.
- `@read file.env key=...` (documented as reading `.env` files, masked) is
  implemented (`readEnvFile` in `sources.ts`) but unreachable: `.env*`/
  `*.env` sits in the immutable `FILESYSTEM_ALWAYS_BLOCK_PATTERNS` list, so
  the always-block rule refuses the read before masking ever applies. The
  sanctioned way to read an env value is `@env NAME`, backed by the CLI's
  `--env <file>` loader, not a direct file read of an arbitrary `.env`.
- Discovered while proving the `checkWritePath` contract: rendering with no
  explicit trace config creates `.livestage/trace/` on disk by default
  (Wave 1's render-trace default-on change). This is read as spec-sanctioned
  ("the only cross-invocation artifact," spec line 45), not a CR-10
  violation, and `tests/unit/engine/source-directives-purity.test.ts`
  excludes it explicitly on that basis; flagged here since CR-10's literal
  wording ("zero filesystem mutations") does not itself carve out the
  trace, and feature 42 (Contract Scans) should confirm this reading when
  it builds the real purity harness.
- `sources.ts` and `read-ops.ts` are shared with feature 18 (Compute
  Directives): `@query`'s engine implementation lives here, and `@hash`'s
  is in `read-ops.ts`, not in 18's `exec-ops.ts`.
