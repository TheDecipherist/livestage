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
  - "Found and fixed a real, silently-broken bug: runBuiltin/isBuiltin split the pipe-stage command on plain whitespace (command.trim().split(/\\s+/)), so a quoted grep pattern (grep \"foo bar\", or even just grep \"foo\" out of authoring habit) kept the literal quote characters as part of the pattern/token, silently matching nothing with no error or warning. Replaced with a shell-style tokenizer (tokenize() in pipe.ts) that strips matching single/double quotes and keeps a quoted span as one token. Known remaining limitation: the tokenizer resolves to plain strings, so it cannot distinguish a quoted \"-i\" (meant as a literal grep pattern) from a bare -i flag; both are still treated as the flag. tests/unit/engine/pipe.test.ts (3 new tests) and tests/unit/engine/pipe-shell-stage.test.ts."
---

# Pipe

## What to Build

`[verify]`. Unix-style pipeline syntax on any directive line:
`source | [grep/sort/head/tail/uniq/wc]* | sink`. Cross-platform Node
built-ins never spawn processes for the standard stage set; other shell
utilities pass through the shell allowlist (feature 10), stripped with WARN
on Windows. A pipe ending in a command (not `@render`) inlines the scalar,
e.g. `@list ./src | wc -l` renders a bare number.

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
quoted-pattern tokenizer bug (fixed, with one documented remaining
limitation around quoted flag-looking patterns like `grep "-i"`).
