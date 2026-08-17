# livestage

Live-document renderer and verifier for AI agents.

**Version 1.0.1** | **1239 tests** | MIT

This README is generated. Every fact in it (the directive reference below,
the version and test count above, the three worked examples) is read live
from the project itself by `README.stage`, never hand-typed. Run
`npm run readme` to regenerate `README.md`; `npm run readme:check` fails
if it would produce a different file than what is currently committed, and
that check runs in CI. See "How this README stays current" at the bottom.

## Install

```
npm install --save-dev livestage
```

Then wire it into an AI coding assistant's hooks:

```
npx livestage init
```

`init` is idempotent (safe to run again, a no-op if already installed) and
transactional (a partial failure rolls back everything it wrote). Concretely,
it makes four changes:

- Registers a **PreToolUse** hook, pointed at the installed package's own
  `dist/hook/pretooluse.js`, so reading a `.stage` file with the normal file
  tool already returns the rendered result, no separate render step.
- Installs a **SessionStart** hook script to `~/.livestage/hooks/sessionStart.mjs`.
  It renders `<project>/CLAUDE-LiveStage.stage` (if that file exists) and
  injects the result into the session, a live, self-updating brief instead of
  a static `CLAUDE.md` section; it makes zero filesystem writes and never
  blocks session start on failure.
- Both hooks are registered in the detected client's own settings file
  (`~/.claude/settings.json` for Claude Code, `~/.cursor/settings.json` for
  Cursor, auto-detected, or pass `--client`).
- Seeds `<project>/.livestage/policy.json` with the strict, deny-by-default
  profile, only if one does not already exist.

Nothing is granted beyond that: every directive that touches the filesystem,
shell, or `@code` still needs an explicit policy grant, same as any other
project.

Or use it standalone, no hook required:

```
npx livestage render some-doc.stage
```

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

## Drift? What's that?

Every `.stage` file in this repo generates itself, including this README.
[`CLAUDE.md`](CLAUDE.md), the one file every Claude Code session in this repo
reads first, is no exception: [`CLAUDE.stage`](CLAUDE.stage) generates it,
checked by `npm run claude-md:check` on every CI run, the exact
`readme`/`readme:check` pattern above, applied to the file that actually
onboards the agent.

Before that existed, `CLAUDE.md` was written once, by Claude Code's own
`/init` command, and never regenerated after: a one-time snapshot, not a
live document. It drifted exactly like any static snapshot does. It
claimed a directive count "as of this writing" (a number nothing kept
honest) and pointed at a donor spec file that had already stopped existing
in this repo. Both sat there, wrong, until someone happened to grep for
them. Being written by an LLM the first time bought it nothing; a snapshot
is a snapshot regardless of who typed it.

Now `CLAUDE.stage` computes 5 modules, 29 directives,
19 worked examples, and every `npm run` script in this
project, live, the same way every number in this sentence was computed at
render time, not typed by hand.

## More examples

Every example below has a rendered `.md` sitting next to its `.stage`
source, kept honest by `npm run examples:check` (mirrors this README's own
`readme:check`, wired into CI). A few are marked "live" because they're
deliberately non-deterministic (real git state, wall-clock timing, an
environment-dependent directory tree); those still ship a rendered
snapshot, just not one asserted byte-identical on every run.

**[`examples/hello.stage`](examples/hello.stage)** ([rendered](examples/hello.md), live)
The smallest possible one: today's date, this directory's tree.

**`examples/drift/`** - four worked examples eliminating a specific kind
of hand-maintained doc/config that silently diverges from the code that
should govern it:
- [`env-drift.stage`](examples/drift/env-drift/env-drift.stage) ([rendered](examples/drift/env-drift/env-drift.md)) - `.env.example` vs actual `process.env` usage.
- [`scripts-reference.stage`](examples/drift/scripts-reference/scripts-reference.stage) ([rendered](examples/drift/scripts-reference/scripts-reference.md)) - `package.json`'s real `scripts`, live.
- [`test-coverage-map.stage`](examples/drift/test-coverage-map/test-coverage-map.stage) ([rendered](examples/drift/test-coverage-map/test-coverage-map.md)) - which source files have no matching test.
- [`todo-debt.stage`](examples/drift/todo-debt/todo-debt.stage) ([rendered](examples/drift/todo-debt/todo-debt.md)) - a live `TODO`/`FIXME`/`HACK` inventory.

**`examples/agent-briefs/`** - the three scenarios above, in full:
[`codebase-health.stage`](examples/agent-briefs/codebase-health.stage) ([rendered](examples/agent-briefs/codebase-health.md), live),
[`change-review.stage`](examples/agent-briefs/change-review.stage) ([rendered](examples/agent-briefs/change-review.md), live),
[`onboarding-brief.stage`](examples/agent-briefs/onboarding-brief.stage) ([rendered](examples/agent-briefs/onboarding-brief.md)).

**`examples/database/`** and **`examples/http-health/`** - there is no
`@db` or `@http` directive; external reach is `@code` under policy.
[`customers.stage`](examples/database/customers.stage) ([rendered](examples/database/customers.md)) runs driver
code in `@code`, renders a table. [`check.stage`](examples/http-health/check.stage) ([rendered](examples/http-health/check.md)) runs `fetch` in
`@code`, renders structured status.

**[`examples/connections/connections.stage`](examples/connections/connections.stage)** ([rendered](examples/connections/connections.md))
A project connections index: path tree, dependency graph, source-file
overlap, all computed, nothing hand-maintained.

**`examples/multi-step/`** - files as steps, frontmatter as state,
assertions as gates, no workflow engine. [`index.stage`](examples/multi-step/index.stage) ([rendered](examples/multi-step/index.md))
is the overview; see its own [README](examples/multi-step/README.md) to
run the actual pipeline (the step files themselves aren't pre-rendered
here, running them changes real state on disk, which is the point).

**`examples/showcase/`** - three documents rendering under the default
policy, no extra grants: [`index.stage`](examples/showcase/index.stage) ([rendered](examples/showcase/index.md)),
[`api-reference.stage`](examples/showcase/api-reference.stage) ([rendered](examples/showcase/api-reference.md)),
[`report.stage`](examples/showcase/report.stage) ([rendered](examples/showcase/report.md), live).

## Directive reference

Every directive LiveStage ships, pulled live from whichever docs declare
`primitives` in their frontmatter, no path convention to keep in sync by
hand. Document a new directive with a `primitives` entry and its Interface
Overview appears here on the next `npm run readme`.


### Source Directives

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
| `join` | separator string (default `\n`) | For multi-line results, the separator used when the label is later read via `{{ }}` (a bare newline-joined label still feeds `@foreach` as a source; `join=", "` reads as prose instead) |

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
| `join` | separator string (default `\n`) | Same as `@list`'s `join=`, for multi-line results |
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
| `depth` | integer | How many directory levels to recurse (unlimited if omitted) |

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

### Compute Directives

These four directives run something and hand back the result: a shell
command, a content hash, or your project's test/check scripts. `@query` is
the general-purpose escape hatch for allowlisted shell commands; `@test`
and `@check` are the same idea shaped specifically for pass/fail results
you can branch on. Nothing here runs unless your project's security policy
explicitly allows it.

| Name | What it does |
|---|---|
| `@hash` | A content hash of a file, for change detection. |
| `@query` | Runs an allowlisted shell command and captures its output. |
| `@test` | Runs the project's test suite and returns a structured pass/fail summary. |
| `@check` | Runs a typecheck/lint/build script and returns a structured pass/fail summary. |

### @hash

Content-hashes a file, handy for detecting whether something changed
without diffing the whole thing.

```stage
@hash "package.json" /
```

| Parameter | Values | Description |
|---|---|---|
| (positional) or `path` | file path | The file to hash |
| `algo` | hash algorithm (default `sha256`) | Which algorithm to use |
| `length` | integer | Truncate the hash to this many characters |
| `exclude-line` | text to match | Strip a matching line (e.g. a timestamp) before hashing, so that line's changes don't change the hash |

### @query

Runs a shell command, but only if it matches the project's
`.livestage/policy.json` allowlist; nothing runs by default.

```stage
@query "git status --short" /
```

| Parameter | Values | Description |
|---|---|---|
| (positional) or `command` | shell command | The command to run |

### @test

Runs the project's test suite and hands back a structured result instead of
raw text, so you can branch on pass/fail without parsing output. With no
`command=`, it auto-detects the project's test script.

```stage
@test label="result" /
Tests: {{ result_summary }}
```

| Parameter | Values | Description |
|---|---|---|
| `command` | shell command | Override the auto-detected test command |
| `label` | name | Capture the structured result (`_exit`, a summary) into a variable |

### @check

The same idea as `@test`, shaped for a typecheck, lint, or build step
instead of the test suite.

```stage
@check label="result" /
Check: {{ result_summary }}
```

| Parameter | Values | Description |
|---|---|---|
| `command` | shell command | Override the auto-detected check command |
| `label` | name | Capture the structured result (`_exit`, a summary) into a variable |

### Composition Directives

These ten directives are how a `.stage` document controls what renders and
reuses logic instead of just listing data top to bottom: branching on a
condition, looping over a list, defining a reusable snippet once and
calling it from several places, or pulling in another `.stage` file. Reach
for these once a document needs to do more than read one thing and print
it.

| Name | What it does |
|---|---|
| `@set` | Assigns a variable for later `{{ }}` use. |
| `@if` | Branches on a condition, rendering its body only when true. |
| `@foreach` | Loops over a list or a query's result. |
| `@switch` | Branches on an expression across multiple cases. |
| `@define` | Defines a reusable, parameterized block (a macro). |
| `@call` | Invokes a macro defined with `@define`. |
| `@include` | Renders another `.stage` file's content inline. |
| `@import` | Pulls in another `.stage` file's macros/env fallbacks without rendering it. |
| `@template` | Renders a reusable partial file against a bound data value. |
| `@data` | Defines a small structured data value inline, for `@template` or `{{ }}` use. |

### @set

Assigns a variable, scoped to the current render only; nothing set here
leaks into a later render of the same document.

```stage
@set count = @count "src" match="*.ts" /
{{ count }} TypeScript files.
```

### @if

Branches on a condition, rendering its body only when the condition is
true. Closed with `@if-end`.

```stage
@set count = @count "src" match="*.ts" /
@if count > 50
This is a big module.
@if-end
```

### @foreach

Loops over a list, or a query's result rows, binding each item to a
variable for the loop body. Closed with `@foreach-end`.

```stage
@foreach file in @list "src" match="*.ts" /
- {{ file }}
@foreach-end
```

### @switch

Branches on an expression across multiple `@case` values, with an optional
`@default` when nothing matches. Closed with `@switch-end`.

```stage
@switch status
@case "active"
Active.
@case "complete"
Done.
@default
Unknown.
@switch-end
```

### @define

Defines a reusable, parameterized block of markdown and directives (a
macro), invoked later with `@call`. Closed with `@define-end`.

```stage
@define greet(name)
Hello, {{ name }}!
@define-end
```

| Parameter | Values | Description |
|---|---|---|
| (positional) | `name(param1, param2)` | The macro's name and parameter list |
| `local` | flag | Scope the macro to this file only, not shared with files that `@include` it |

### @call

Invokes a macro previously defined with `@define`, passing arguments
either positionally or as `key=value` pairs.

```stage
@call greet("world")
```

| Parameter | Values | Description |
|---|---|---|
| (positional) | `name(arg1, arg2)` or `name key=value` | The macro to invoke and its arguments |

### @include

Renders another `.stage` file's content inline, as if it were pasted at
this point in the document. Paths are confined to the project, no
absolute paths and no `..` traversal.

```stage
@include "partials/header.stage" /
```

| Parameter | Values | Description |
|---|---|---|
| (positional) or `path` | file path | The `.stage` file to render inline |
| `if` | expression | Only include when the expression is true |
| `local` | flag | Don't share this file's own macros back out |

### @import

Pulls in another `.stage` file's macro and environment-fallback
definitions without rendering any of its content, useful for sharing
`@define`d macros across files.

```stage
@import "partials/macros.stage" /
```

| Parameter | Values | Description |
|---|---|---|
| (positional) or `path` | file path | The `.stage` file to import definitions from |
| `if` | expression | Only import when the expression is true |
| `local` | flag | Don't re-export this file's own macros |

### @template

Renders a reusable partial file against a bound data value, useful for
rendering the same layout once per item in a `@foreach`.

```stage
@foreach user in @list "data/users.json" /
@template "partials/user-card.stage" data="{{ user }}" as="user" /
@foreach-end
```

| Parameter | Values | Description |
|---|---|---|
| (positional) or `path` | file path | The partial `.stage` file to render |
| `data` | expression | The value to bind into the partial |
| `as` | identifier (default `data`) | The variable name the partial sees |
| `if` | expression | Only render when the expression is true |

### @data

Defines a small structured data value inline, one `key = expression` (or
`...expression` to spread another value's fields) per line, for use with
`@template` or `{{ }}` interpolation elsewhere in the document.

```stage
@data user
  name = "Ada"
  role = "engineer"
@data-end
{{ user.name }}, {{ user.role }}
```

| Parameter | Values | Description |
|---|---|---|
| (positional) or `name` | identifier | The variable name this data is bound to |

### Render Formats

`@render` is how piped data becomes readable markdown instead of raw
tab-separated lines: point it at a shape (a table, a tree, a bulleted
list, a bar chart, and five more) and it formats whatever the pipe handed
it. It's always the last stage of a pipeline, taking the output of a
source directive like `@list` or `@query` and turning it into something a
person would actually want to read.

| Name | What it does |
|---|---|
| `@render` | Turns piped data into a markdown shape, table, tree, list, and six more. |

### @render

Always the last stage of a pipe: takes whatever a source directive produced
(optionally filtered through `grep`/`sort`/`head`/`tail`/`uniq`/`wc`) and
turns it into a specific markdown shape. `as="type"` on the source directive
itself is shorthand for `| @render type="type"`.

```stage
@list "src" match="*.ts" | @render type="table" /
```

| Parameter | Values | Description |
|---|---|---|
| `type` | `table` \| `tree` \| `list` \| `numbered` \| `bar` \| `code` \| `json` \| `inline` \| `links` | Which markdown shape to produce |
| `columns` | `col1,col2` | Column headers, for `table` |
| `lang` | language name | Fence language, for `code` |
| `compact` | `true`, for `table` | Skip column-width padding: no alignment, one space per cell, for output read as raw text rather than through a markdown viewer |

### Pipe

These are the Unix-style filters you chain between a source directive and
`@render` (or a scalar result), the same way you'd pipe commands on a
command line. They never spawn a process, so they work identically on
every platform, and each one takes plain lines of piped data and narrows,
reorders, or summarizes them before the next stage sees the result.

| Name | What it does |
|---|---|
| `grep` | Keeps only lines matching (or, with `-v`, not matching) a pattern. |
| `sort` | Sorts lines alphabetically or numerically. |
| `head` | Keeps only the first N lines. |
| `tail` | Keeps only the last N lines. |
| `uniq` | Drops consecutive duplicate lines. |
| `wc` | Counts lines, words, or characters. |
| `count-by` | Groups rows by a column and counts how many fall in each group. |

### grep

Keeps only the lines matching a pattern, or with `-v`, only the ones that
don't.

```stage
@list "src" match="*.ts" | grep -v test | @render type="list" /
```

| Parameter | Values | Description |
|---|---|---|
| (positional) | text or pattern | What to match against each line |
| `-i` | flag | Case-insensitive match |
| `-v` | flag | Invert the match: keep non-matching lines instead |

### sort

Sorts the piped lines alphabetically by default, or numerically with `-n`;
`-r` reverses either order.

```stage
@list "src" match="*.ts" | sort | @render type="list" /
```

| Parameter | Values | Description |
|---|---|---|
| `-n` | flag | Sort numerically instead of alphabetically |
| `-r` | flag | Reverse the sort order |

### head

Keeps only the first N lines (10 by default).

```stage
@query "git log --oneline" | head 5 | @render type="list" /
```

| Parameter | Values | Description |
|---|---|---|
| (positional) | integer (default 10) | How many lines to keep from the start |

### tail

Keeps only the last N lines (10 by default).

```stage
@query "git log --oneline" | tail 5 | @render type="list" /
```

| Parameter | Values | Description |
|---|---|---|
| (positional) | integer (default 10) | How many lines to keep from the end |

### uniq

Drops a line when it's identical to the one immediately before it, the
same behavior as the Unix `uniq` command (sort first if you need
duplicates removed regardless of position).

```stage
@query "git log --format='%ae'" | sort | uniq | @render type="list" /
```

### wc

Counts lines by default; `-w` counts words instead, `-c` counts
characters. A pipe that ends in `wc` (with no `@render`) inlines the bare
number.

```stage
@list "src" match="*.ts" | wc -l
```

| Parameter | Values | Description |
|---|---|---|
| `-l` | flag (default) | Count lines |
| `-w` | flag | Count words |
| `-c` | flag | Count characters |

### count-by

Groups rows by one column and counts how many rows fall into each group,
sorted from most to least common, handy for a quick "how many of each"
summary over tabular data.

```stage
@list "data/issues.csv" | count-by status | @render type="table" columns="status,count" /
```

| Parameter | Values | Description |
|---|---|---|
| (positional) | column name | Which column to group rows by |

### Assert Operators

`@assert` is a pass/fail check against real files: does this path exist,
does it contain a pattern, does a JSON key have the value you expect. It's
the building block `livestage validate` and `livestage assert` use to gate
a document (or a whole project) in CI, so a broken assumption fails the
build instead of silently shipping.

| Name | What it does |
|---|---|
| `@assert` | Checks a file (or set of files) against a condition and reports pass or fail. |

### @assert

Runs one check against `target` (a file path or glob) using the chosen
`operator`, and renders an inline pass/fail line.

```stage
@assert operator="file-exists" target="package.json" /
```

| Parameter | Values | Description |
|---|---|---|
| `operator` | `file-exists` \| `contains` \| `some-contains` \| `contains-if-present` \| `absent` \| `json-key` | Which check to run |
| `target` | glob | The file(s) to check |
| `pattern` | text | Content to look for, for `contains`/`some-contains`/`contains-if-present`/`absent` |
| `key` | dot/bracket path | The key to look up, for `json-key` |
| `equals` | value | Require the key to equal this value, for `json-key` |
| `label` | name | Capture the structured result (`operator`, `matches`, `passed`, `vacuous`) into a variable |

Only `absent` and `contains-if-present` are allowed to pass when nothing
matches (a missing target is exactly what they're checking for); every
other operator fails on zero matches, so a check can never quietly pass
because its target went missing by accident.

### Code Runners

`@code` is the escape hatch for anything with no dedicated directive: hit
an HTTP API, query a database, run a small transformation, whatever a
five-line script can do. It's off by default; your project's security
policy has to explicitly grant the language before any script runs.

| Name | What it does |
|---|---|
| `@code` | Runs a real script (JavaScript, Python, or another granted language) and captures its output. |

### @code

Runs a script, either inline as a block body or from a file via `src=`,
and captures its result. If the script's stdout is valid JSON, it's bound
as structured data under `label` instead of raw text.

```stage
@code language="javascript" label="health"
const res = await fetch('http://localhost:3000/health')
console.log(JSON.stringify({ ok: res.ok, status: res.status }))
@code-end

Status: {{ health.status }}, OK: {{ health.ok }}
```

| Parameter | Values | Description |
|---|---|---|
| `language` | granted language (e.g. `javascript`, `python`, `bash`) | Which runner to use; inferred from `src=`'s extension when omitted |
| `src` | file path | Run a script file instead of an inline body |
| `label` | name | Capture the result (raw output, or parsed JSON) into a variable |
| `timeout` | milliseconds | Override the default execution timeout |
| `interpolate` | `true` \| `false` (default) | Expand `{{ }}` inside the script body before running it |

### Update Frontmatter

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

### Graph

`@graph` walks a relationship between markdown documents, like a
`depends_on` chain across a set of feature docs, and renders it as a
tree, a table, or a Mermaid diagram. It catches cycles and broken
references (a doc pointing at an id that doesn't exist) automatically, so
you don't have to eyeball a big dependency list to spot them.

| Name | What it does |
|---|---|
| `@graph` | Walks a frontmatter relationship across a set of documents and renders it as a tree, table, or diagram. |

### @graph

Builds the relationship graph starting from `target` and renders it.

```stage
@graph target=".mdd/docs/*.md" relation="depends_on" format="tree" /
```

| Parameter | Values | Description |
|---|---|---|
| `target` | glob | Which documents to include in the graph |
| `relation` | frontmatter field (default `depends_on`) | Which relationship field defines the edges |
| `id-field` | frontmatter field (default `id`) | Which field identifies each node |
| `format` | `tree` \| `table` \| `mermaid` (default `tree`) | How to render the graph |
| `label` | name | Capture the structured result (`_nodes`, `_edges`, `_cycles`, `_broken`, `_broken_list`) into a variable |


## How this README stays current

`README.stage` (the source of this file, not `README.md` itself) reads:

- the directive reference above, live, from every `.mdd/docs/*.md` doc
  that declares `primitives` in its frontmatter, via a frontmatter query
  (`where="primitives.length > 0"`) plus the `read_section()` builtin
  pulling each doc's `## Interface Overview`, the one section in the doc
  corpus written for a reader with zero project context,
- `package.json`'s name, version, and description, via `@read`,
- the current test count, via `@read` on `scripts/test-baseline.json`,
- the three worked examples' actual source, via `@read`, so the shown
  code can never drift from what actually runs.

`npm run readme` regenerates `README.md` by calling the existing
`livestage build` CLI verb. `npm run readme:check` regenerates into a
throwaway comparison and fails if the committed `README.md` differs, and
that check runs in CI on every push, so a stale README fails the build
instead of quietly persisting.

The one thing that still needs a human: writing `## Interface Overview`
itself when a new directive lands, the same way `title` or any other
judgment-call frontmatter field is authored by hand. Everything else,
discovery, names, syntax, examples, counts, is automatic.

---

MIT License.
