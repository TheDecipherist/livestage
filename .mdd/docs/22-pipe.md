---
id: 22-pipe
title: Pipe
type: COMPONENT
path: Directives / Pipe
source_files: [src/parser/directives/pipe.ts, src/parser/directives/render.ts, src/engine/pipe.ts, src/engine/shell.ts]
status: complete
phase: all
last_synced: 2026-08-01
initiative: livestage
wave: livestage-wave-2
depends_on: [19-composition-directives, 21-cache]
tags: [pipe, unix-style, grep, sort, head, tail, uniq, wc, cross-platform]
known_issues:
  - "source_files was missing src/engine/shell.ts (runShell), the non-built-in pipe-stage shell executor dispatched from engine.ts's 'shell' pipe stage case; it was misattributed to feature 18 (Compute Directives) instead. Corrected here and cross-referenced in 18's known_issues."
  - "Business rule 2 (non-built-in shell utilities in a pipe stage are stripped with a WARN on Windows) had zero implementation and zero test coverage before this wave: process.platform was never checked anywhere in src/. Implemented in engine.ts's pipe 'shell' case (checked before runShell is called) and tested with process.platform spoofed via Object.defineProperty; tests/unit/engine/pipe-shell-stage.test.ts (3 tests)."
  - "Found and fixed a real, silently-broken bug: runBuiltin/isBuiltin split the pipe-stage command on plain whitespace (command.trim().split(/\\s+/)), so a quoted grep pattern (grep \"foo bar\", or even just grep \"foo\" out of authoring habit) kept the literal quote characters as part of the pattern/token, silently matching nothing with no error or warning. Replaced with a shell-style tokenizer (tokenize() in pipe.ts) that strips matching single/double quotes and keeps a quoted span as one token. tests/unit/engine/pipe.test.ts (3 new tests) and tests/unit/engine/pipe-shell-stage.test.ts."
  - "RESOLVED (2026-08-02, post-initiative known_issues sweep): the
    quoted-flag-lookalike limitation above is fixed. tokenize() now
    returns { text, quoted } per token instead of a bare string, and
    runGrep only treats an UNQUOTED token as a -i/-v/-iv flag; a quoted
    \"-i\" is always the two-character literal pattern. Other builtins
    (sort/head/tail/wc/uniq/count-by) never inspected quoted-ness, so they
    keep working against plain token text unchanged (runBuiltin unwraps to
    .map(t => t.text) before dispatching to them). tests/unit/engine/pipe.test.ts's
    three new grep-quoting tests."
  - "[gap] Business rule 1 and the What to Build summary name only grep/sort/
    head/tail/uniq/wc as the built-in pipe stages; count-by (groups rows by a
    column and counts occurrences, src/engine/pipe.ts's runCountBy) is a
    seventh built-in with the same cross-platform, never-spawns-a-process
    property, undocumented until this pass. Now covered in primitives/
    Interface Overview below; the Business Rules prose still only lists six."
primitives:
  - name: "grep"
    kind: pipe-builtin
  - name: "sort"
    kind: pipe-builtin
  - name: "head"
    kind: pipe-builtin
  - name: "tail"
    kind: pipe-builtin
  - name: "uniq"
    kind: pipe-builtin
  - name: "wc"
    kind: pipe-builtin
  - name: "count-by"
    kind: pipe-builtin
---

# Pipe

## What to Build

`[verify]`, copy from `~/projects/markdownai/packages/parser/src/directives/pipe.ts`
and `~/projects/markdownai/packages/engine/src/pipe.ts` (plus `shell.ts` for
the non-built-in stage executor, see known_issues). Unix-style pipeline
syntax on any directive line:
`source | [grep/sort/head/tail/uniq/wc]* | sink`. Cross-platform Node
built-ins never spawn processes for the standard stage set; other shell
utilities pass through the shell allowlist (feature 10), stripped with WARN
on Windows. A pipe ending in a command (not `@render`) inlines the scalar,
e.g. `@list ./src | wc -l` renders a bare number.

## Interface Overview

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

## Architecture

Sits between a source/compute directive and `@render` (feature 20), or can
terminate directly in a scalar-producing command stage.

## Implementation Notes

The five/six standard stages (`grep`, `sort`, `head`, `tail`, `uniq`, `wc`)
are implemented as cross-platform Node built-ins specifically so they never
spawn a process (and therefore never touch the shell allowlist). Any other
utility named in a pipe stage falls through to the shell allowlist and is
stripped with a WARN on Windows where the allowlist model does not translate
directly (line 348).

## Data Model

N/A.

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

## Acceptance Criteria

- [x] `@list ./src | wc -l` renders a bare number matching the actual file
      count. Live-verified against a real fixture directory.
- [x] `<source> | grep <pattern> | @render list` filters correctly.
      Live-verified; also uncovered and fixed a real bug (quoted patterns
      matched nothing), see Known Issues and `pipe.test.ts`.
- [x] A non-built-in utility in a pipe stage on a non-Windows fixture
      resolves through the shell allowlist; on a Windows-simulated fixture it
      is stripped with a WARN. Was entirely unimplemented; built and tested
      this wave, `tests/unit/engine/pipe-shell-stage.test.ts` (3 tests).

## Dependencies

19-composition-directives (pipe consumes composed/interpolated source
output), 21-cache (piped results are cacheable the same as direct directive
results).

## Known Issues

See the frontmatter `known_issues` above: the missing `src/engine/shell.ts`
source file, the unimplemented Windows-stripping rule (now built), and the
quoted-pattern tokenizer bug (fixed), including the quoted-flag-lookalike
limitation (`grep "-i"`) that was documented as remaining, now also fixed.
