# livestage

Live-document renderer and verifier for AI agents.

**Version 0.0.1** | **1239 tests** | MIT

This README is generated. Every fact in it (the directive reference below,
the version and test count above, the three worked examples) is read live
from the project itself by `README.stage`, never hand-typed. Run
`npm run readme` to regenerate `README.md`; `npm run readme:check` fails
if it would produce a different file than what is currently committed, and
that check runs in CI. See "How this README stays current" at the bottom.

## What LiveStage is

A `.stage` file mixes prose with executable directives instead of storing
static data: file listings, frontmatter reads, git queries, hashes, test
results, script output, assertions. When an agent reads the file, the
engine resolves every directive at that moment and returns pure markdown,
with zero directive syntax remaining. The directive syntax exists only at
rest, for authors; the agent consuming a render needs no knowledge of
LiveStage at all.

The agent decides, LiveStage computes. The engine never judges, gates, or
chooses; it resolves deterministic data and hands it back as markdown.
Every directive declares a static fallback, so a `.stage` file read
without the engine (or after a timeout) is still a usable, honest document
that says it is degraded.

## Install

```
npm install --save-dev livestage
```

Then wire it into an AI coding assistant's hooks (a PreToolUse hook renders
`.stage` reads inline; a SessionStart hook can inject a designated brief):

```
npx livestage init
```

Or use it standalone, no hook required:

```
npx livestage render some-doc.stage
```

## A minimal example

```stage
# Project status

@query "git log -1 --format='%h %s'" label="last_commit" /
@count "src" match="*.ts" label="file_count" /

Last commit: {{ last_commit }}. {{ file_count }} TypeScript files.
```

Rendering that produces plain markdown, no directive syntax, no matter
how many times you run it or how much the repo changes underneath it.

## Real-world scenarios: what this actually saves

The pitch above is abstract. Here is what it looks like in practice,
three real, runnable examples under `examples/agent-briefs/`, each
replacing several separate shell commands (that an agent would otherwise
run one at a time, then hold the combined picture in its own context)
with a single render that returns a finished status result.

Each is read live from its real, runnable file below, a directive pipeline
(`@read ... | @render type="code"`), not a hand-retyped snippet that could
drift from what actually runs. Run any of them yourself with `livestage
render <file>` from inside `examples/agent-briefs/`, where the shared
policy grant applies.

### Codebase health, one render instead of three commands

Old way: `git rev-parse --abbrev-ref HEAD`, then `git log -1`, then
`git status --short`, three round trips, three outputs to mentally merge.

```stage
# Codebase Health Brief
The old way: `git rev-parse --abbrev-ref HEAD`, `git log -1`, `git status
--short`, three separate commands run and mentally merged into one picture
of "is this repo in good shape right now."
The new way: one render.
## Policy grant this example needs
`examples/agent-briefs/.livestage/policy.json` in this directory (shared
with `change-review.stage`): `shell.enabled` plus the exact `git ...`
command strings below in `allow_patterns`, nothing else, and no wildcard
(a prefix pattern like `"git *"` allows anything after that prefix,
including `;`/`&&`/pipe chaining; only safe with commands that never
interpolate `{{ }}`/`${}` values, exact strings are the honest default).
See that file directly for the exact JSON.
## Result
@query "git rev-parse --abbrev-ref HEAD" label="branch" visible="false" /
@query "git log -1 --format='%h %s'" label="last_commit" visible="false" /
@query "git status --short" label="dirty" visible="false" /
- Branch: {{ branch }}
- Last commit: {{ last_commit }}
@if dirty == ""
- Uncommitted files: none detected
@if-end
@if dirty != ""
- Uncommitted files:
{{ dirty }}
@if-end
```

### Change review, one render instead of three commands

Old way: `git diff --stat`, `git log -5 --oneline`, `git status --short`.

```stage
# Change Review Brief
The old way: `git diff --stat`, `git log -5 --oneline`, `git status
--short`, three commands and three separate scrollbacks to reconstruct
"what changed here, and what's still uncommitted."
The new way: one render.
## Policy grant this example needs
Shares `examples/agent-briefs/.livestage/policy.json` with
`codebase-health.stage`: `shell.enabled` plus the exact `git ...` command
strings this file uses below in `allow_patterns`, no wildcard.
## Result
@query "git diff --stat" label="diff_stat" visible="false" /
@query "git log -5 --oneline" label="recent_commits" visible="false" /
@query "git status --short" label="status" visible="false" /
### Diff stat
{{ diff_stat }}
### Recent commits
{{ recent_commits }}
### Working tree status
{{ status }}
```

### Onboarding brief, one render instead of four commands, zero shell grant

Old way: `cat README.md`, `cat package.json`, `ls src`, `grep scripts
package.json`. This one needs no `shell` policy grant at all, `@read` and
`@tree` are filesystem-policy directives, not shell, proof that a whole
class of "read this project" agent work never needs shell access in the
first place.

```stage
# Onboarding Brief
The old way: `cat README.md`, `cat package.json`, `ls src`, `grep scripts
package.json`, four separate commands before an agent (or a new
contributor) has any real picture of what a project even is.
The new way: one render. This example needs no shell grant at all, no
`.livestage/policy.json` beyond the shared one in this directory (which
this file doesn't even use): `@read` and `@tree` are filesystem-policy
directives, not shell.
## Result
Runs against a small, self-contained fixture project
(`sample-project/`) alongside this file, so the pattern is reusable in any
project without a path escaping this example's own directory.
@read "sample-project/package.json" path="name" label="proj_name" visible="false" /
@read "sample-project/package.json" path="description" label="proj_desc" visible="false" /
@tree "sample-project/src" label="src_tree" visible="false" /
## Onboarding Brief: {{ proj_name }}
{{ proj_desc }}
### Source tree
{{ src_tree }}
```

## Directive reference

Every directive LiveStage ships, grouped exactly as the project's own
build docs group them, and pulled live from those docs on every render of
this file. Add a directive to an existing group's documentation and it
appears here on the next `npm run readme`, no separate README work.


### Source Directives

## API/Interface

| Directive | Key attrs | Behavior |
|---|---|---|
| `@list` | glob/`match`/`type`/`depth` (filesystem), `path`/`mode` (JSON), `columns`+`where` (structured rows), `label`, `as=` | files, dirs, JSON array/object items, CSV rows |
| `@read` | `file`, `path=` (dot-notation, JSON/YAML/TOML), `column=`+`where=` (CSV), `key=` (.env) implemented but unreachable, see Known Issues), `label`, `as=` | raw file content, or a value/table extracted from structured files |
| `@read-frontmatter` | `path`, `field` (single, seeded) | schema-validated (F-SCHEMA); reads ONE top-level field per call, arrays comma-joined |
| `@tree` / `@count` | path/glob | tree render / count |
| `@date` / `@env` | format / `fallback` | now / env value; `@env` has no `masked` attribute. A resolved secret-shaped value is masked before it is written to cache (`cache.ts`) or a trace record (`engine.ts`'s `applyMasking` on directive args), never in the primary render/stdout output, which shows the value the caller explicitly requested |

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

### Compute Directives

## API/Interface

| Directive | Key attrs | Behavior |
|---|---|---|
| `@hash` | `path`, `exclude-line`, `label` | content hash |
| `@query` | `command` | allowlisted shell, captured output |
| `@test` / `@check` | `command` | structured `_exit`, `_summary` |

## Business Rules

1. `@query` executes only allowlisted shell commands (line 339, feature 06
   rule 1).
2. `@test`/`@check` execute through the same allowlist as `@query`; the
   runner patterns must be present in the shipped profile (line 424-428).
3. `@hash`'s `exclude-line` option excludes a matching line before hashing
   (e.g. to hash content ignoring a timestamp line).

### Composition Directives

## API/Interface

| Directive | Key attrs | Behavior |
|---|---|---|
| `@set` | `name`, `value` | single-render scope |
| `@if`/`@foreach`/`@switch` | `expr` / `x in {{ }}` | control flow |
| `@define`/`@call` | `name` | macros |
| `@include`/`@import` | `path` | inline / import macros |
| `@template`/`@data` | `data=`, `as=` | bound-data partials |

## Business Rules

1. `@set` scopes to a single render pass; no leakage across invocations
   (line 93-94).
2. `@include`/`@import`/`@template` resolve `.stage` files relative to the
   including document, subject to filesystem policy (line 322-324).
3. The `allowed()` sandbox builtin performs validated dispatch against a
   fixed list of allowed values (line 455-456).

### Render Formats

## API/Interface

`@render type=table|tree|list|numbered|bar|code|json|inline|links` (line
349). Pipe sink syntax: `<source> | [grep/sort/head/tail/uniq/wc]* | @render
<type>`.

## Business Rules

1. `@render` is the pipe SINK, never standalone (line 349).
2. `as="type"` is shorthand for `| @render type` (line 349).
3. All nine formats emit plain markdown constructs only (line 326-327,
   CR-11).
4. `flow`, `timeline`, and `row` formats must not exist in this build
   (line 593-594): `row`'s only consumer was the retired `@db as=row`
   directive, and `flow`/`timeline` supported the retired workflow-spine
   directives.

### Pipe

## API/Interface

`source | [grep/sort/head/tail/uniq/wc]* | sink` (line 348). Sink is either
`@render <type>` (feature 20) or, when the last stage is a command, the
pipeline inlines a scalar result.

## Business Rules

1. `grep`/`sort`/`head`/`tail`/`uniq`/`wc` are cross-platform Node built-ins,
   never spawning processes (line 348).
2. Other shell utilities in a pipe stage pass through the shell allowlist
   (feature 10) and are stripped with a WARN on Windows (line 348).
3. A pipe ending in a command inlines the scalar result, e.g.
   `@list ./src | wc -l` renders a bare number (line 348).

### Assert Operators

## API/Interface

`@assert` (self-closing), attrs: `operator`, `target`, plus `pattern`/`key`/
`equals=` depending on operator (line 342).

| Operator | Passes when | Zero-match behavior |
|---|---|---|
| `file-exists` | every path matching `target` exists | FAIL |
| `contains` | every matched file contains `pattern` | FAIL |
| `some-contains` | at least one matched file contains `pattern` | FAIL |
| `contains-if-present` | every matched file that exists contains `pattern` | pass (explicitly conditional) |
| `absent` | no matched file contains `pattern` | pass (vacuous pass permitted, flagged `vacuous: true`) |
| `json-key` | key path present (optionally `equals=`) in matched JSON/frontmatter | FAIL |

## Business Rules

1. `file-exists`, `contains`, `some-contains`, `json-key` FAIL on zero
   matches (line 367-372, table).
2. `contains-if-present` passes vacuously and explicitly (not flagged) when
   nothing matches (line 370).
3. `absent` is the only operator permitted to pass vacuously, and it is
   flagged `vacuous: true` when it does (line 371).
4. Every result carries `{ operator, target, matches, passed, vacuous }`
   (line 374).

### Assert Liveness

## API/Interface

Consumed by `livestage validate <file|glob>` (line 520): exit 0 all valid,
exit 1 any invalid (including inert assertions, removed directives, args
without fallback, ungranted `@code` language), exit 2 usage/parse error.

## Business Rules

1. `validate` refuses a document whose every assertion is inert (line 374-375).
2. `validate` warns on suspicious regexes (double-escape compiling to a
   literal backslash) (line 375-376).
3. `validate` fails a document that dereferences args without an absent-args
   fallback (line 459-460, shared rule with feature 23).
4. `validate` fails a document using an ungranted `@code` language (line 520,
   shared rule with feature 29).

### Code Runners

## API/Interface

`@code language= src?= label?= timeout?= interpolate=false` (line 341,
378-392).

## Business Rules

1. Runner map comes from policy config; `javascript -> node`, `python ->
   python3`, `bash -> bash`, extensible (line 381-382).
2. Results: `_exit`, `_stdout`, `_stderr`, `_duration`; JSON stdout binds as
   structured data under `label` (line 382-384).
3. Context in via `LIVESTAGE_CONTEXT` (JSON) and stdin; `{{ }}` interpolation
   inside the body is opt-in via `interpolate=true` (line 384-386).
4. OFF in every profile until the project policy grants `code: { languages:
   [...], timeout: <ms> }`; an ungranted language fails at `validate` AND at
   runtime (line 388-390).
5. Engine-built runner invocations always execute a temp script file, never
   an inline `-e`/`-c` string; this is the single sanctioned exception to the
   inline-execution always-block (line 436-441).
6. A user's `@query "node -e ..."` remains always-blocked even if a pattern
   would allow it (line 439-441).

### Update Frontmatter

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

### Graph

## API/Interface

`@graph <relation fields> format=tree|table|mermaid label=` (line 351,
640-645).

## Business Rules

1. Native edges are read from frontmatter relation fields (e.g.
   `depends_on`, `relates`), schema-validated.
2. Cycle detection and broken-edge detection both run on every `@graph`
   call (line 351, 641).
3. `format=mermaid` emits a fenced ` ```mermaid ` block with per-node status
   classDefs (line 642-644).
4. Structured counts (`_nodes`, `_edges`, `_cycles`, `_broken`,
   `_broken_list`) are label-capturable (line 644-645).

### Frontmatter Query

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


## How this README stays current

`README.stage` (the source of this file, not `README.md` itself) reads:

- the directive reference above, live, from `.mdd/docs/*.md`'s
  `## API/Interface` and `## Business Rules` sections, via a frontmatter
  query (`where=`/`fields=`) plus the `read_section()` builtin,
- `package.json`'s name, version, and description, via `@read`,
- the current test count, via `@read` on `scripts/test-baseline.json`,
- the three worked examples' actual source, via `@read`, so the shown
  code can never drift from what actually runs.

`npm run readme` regenerates `README.md` by calling the existing
`livestage build` CLI verb. `npm run readme:check` regenerates into a
throwaway comparison and fails if the committed `README.md` differs, and
that check runs in CI on every push, so a stale README fails the build
instead of quietly persisting.

The one thing that still needs a human: a brand-new directive filed under
a doc outside the `Directives /` / `Renderer / Formats` / `Engine / Code
Runners` path convention needs a one-line addition to the query above.
Everything else, names, syntax, examples, counts, is automatic.

---

MIT License.
