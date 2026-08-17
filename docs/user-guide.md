# LiveStage User Guide

LiveStage is a live-document format: a `.stage` file mixes prose with
executable directives that declare their data instead of storing it. When
an agent or the CLI reads a `.stage` file, the engine resolves every
directive at that moment and hands back pure markdown, with zero directive
syntax left in it. The document that goes stale the moment someone writes
it, a status page, a dependency graph, a "what changed" log, stops existing
as a category; it is replaced by a document that computes its own answer on
every read.

This guide is the canonical authoring reference: what the tool actually is,
how to write `.stage` files, and the patterns that cover the work LiveStage
deliberately does not build a directive for.

## Architecture, in one paragraph

LiveStage is not a server. There is no daemon, no socket, no session, and
no cross-invocation memory beyond an append-only render trace the engine
never reads back. Every invocation, whether it is `livestage render`, the
PreToolUse hook, or `livestage validate`, starts cold, resolves the
document, and exits. Rendering is pure: the only sanctioned write is
`@update-frontmatter`, schema-validated and atomic; anything else that
needs to touch the world goes through a policy-granted `@code` script,
where the write is visible and traced, never hidden inside a directive.
Every execution surface, shell commands, HTTP, database access, `@code`
languages, is gated by a project's `.livestage/policy.json`: HTTP and
`@code` ship off until you grant them, and shell ships with a curated
read-only allowlist so `@query`/`@test`/`@check` work out of the box (a
fresh `livestage init` seeds the strict profile instead, shell off too,
until you add your own grants).

## Getting started

```sh
npx livestage render examples/hello.stage
```

renders a `.stage` file to markdown on stdout. `livestage init` registers a
PostToolUse hook (Claude Code, or any client with an equivalent hook
mechanism) so that reading a `.stage` file with the normal file-read tool
already returns the rendered result, no separate render step. `livestage
validate <file|glob>` checks a document (or a directory) for structural and
semantic problems without running it; `livestage assert <file|glob>` runs
every `@assert` in a document and exits non-zero on the first failure, the
CI-gate form.

## Writing `.stage` files

A directive is a line-level construct: it must start its own line to be
recognized. `{{ expression }}` is inline value interpolation and can appear
anywhere in prose, including inside a directive's own attribute values.

**Self-closing** directives end their line with ` /`: `@list`, `@read`,
`@read-frontmatter`, `@tree`, `@count`, `@date`, `@env`, `@hash`, `@query`,
`@test`, `@check`, `@set`, `@render`, `@import`, `@include`, `@template`,
`@call`, `@assert`, `@graph`, `@update-frontmatter`. `@code` can also be
self-closed when it has an external script (`src=`) instead of an inline
body, which is what makes it usable as a pipe source.

**Block** directives open on one line and close with `@<name>-end`:
`@define`, `@if`, `@foreach`, `@switch`, `@data`, `@code` (inline body
form).

**Pipes** chain a source into filters and a sink on one line:
`<source> | grep <pattern> | @render type="table" /`. `grep`, `sort`,
`head`, `tail`, `uniq`, `wc`, and `count-by` are built in and never spawn a
process; anything else goes through the project's shell allowlist.

A directive that fails, or that isn't granted by policy, degrades: it
renders to an empty string (or a clear warning), never a crash and never
silently wrong output. A `.stage` file with nothing granted still renders
something sensible.

### Frontmatter as state

Every read-side directive that touches YAML frontmatter (`@read-frontmatter`,
`@list ... where=/fields=`, `@graph`) reads top-level scalar and list
fields; nested objects are out of scope by design (walk those with
`@code` instead, see below). `@update-frontmatter path= field= value= /` is
the one sanctioned write: schema-validated if the target document declares
a `class:` with a matching schema under `.livestage/schemas/`, and atomic
(write-to-temp, then rename) so a crash mid-write never leaves a corrupted
file.

### Querying a doc corpus

`@list <glob> where="<expr>" fields="a,b,c" | @render type="table"` turns a
loop that used to be a hundred `@foreach` iterations into one line: `where=`
filters each matched file's frontmatter (array fields support
`.length`/emptiness checks), `fields=` projects columns. `@graph
target=<glob> format=tree|table|mermaid` builds a dependency graph from a
`depends_on`-shaped frontmatter field, with cycle and broken-edge
detection built in.

## The patterns that cover what LiveStage does not build a directive for

LiveStage is deliberately not a workflow engine and does not reach past the
filesystem and the allowlisted shell on its own. Two worked patterns cover
that gap instead of a directive tier:

**Multi-step work.** Files as steps, frontmatter as state, assertions as
gates: `examples/multi-step/` is the full worked example, three steps that
render green run in sequence, block with a named reason (skipped-step or
stale-state) run out of sequence, and leave `state.stage` in a state safe
to retry after a killed render. There is no orchestrator process; each step
is one `livestage render` call.

**Database and HTTP access.** There is no `@db` or `@http` directive.
External reach is `@code` under policy: `examples/database/` shows driver
code living entirely inside a granted `@code` script, JSON or tabular
output rendered by the document; `examples/http-health/` shows the same
shape for a `fetch` call. Each example ships the exact `.livestage/policy.json`
grant it needs alongside it.

**Generated files.** `examples/connections/` is the general case: a
project-connections index (path tree, dependency graph, source-file
overlap) that used to be a script someone ran by hand and forgot to
re-run. It composes frontmatter queries, `@graph`, and a nested-array
`@code` script (the one shape `where=` deliberately does not support) into
one document that is correct on every render because nothing in it is
stored.

## Security model

Every execution surface, shell, HTTP, database, `@code` languages, resolves
through one deny-by-default allowlist in `.livestage/policy.json`, checked
after `{{ }}` interpolation so an interpolated argument can never smuggle a
command past policy. A small set of destructive shell patterns (`rm -rf`,
`node -e`, `mkfs`, ...) are immutable always-blocks: no policy file can
allowlist them back in. `@code` scripts spawn via an argv array, never a
shell string, so they never reach the shell allowlist at all; that is an
architectural property, not a policy exception.

## Determinism

`--deterministic` (or `LIVESTAGE_DETERMINISTIC=1`) freezes the clock at
`LIVESTAGE_NOW` and seeds UUID generation from `LIVESTAGE_SEED`, so two
renders of the same document, same environment, produce byte-identical
output. `@query mock="fixture.txt"` and `@code mock="fixture.txt"` serve a
recorded fixture instead of executing, the mechanism that makes golden-file
testing viable across the whole render surface.

## Reference examples

- `examples/hello.stage` - the smallest possible document.
- `examples/multi-step/` - the multi-step pattern (state machine, no engine).
- `examples/database/`, `examples/http-health/` - reach via `@code`.
- `examples/connections/` - a live, generated-file-replacing project index.
