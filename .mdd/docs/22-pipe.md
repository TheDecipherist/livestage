---
id: 22-pipe
title: Pipe
type: COMPONENT
path: Directives / Pipe
source_files: [src/parser/directives/pipe.ts, src/parser/directives/render.ts, src/engine/pipe.ts]
status: planned
phase: idle
last_synced: 2026-08-01
initiative: livestage
wave: livestage-wave-2
depends_on: [19-composition-directives, 21-cache]
tags: [pipe, unix-style, grep, sort, head, tail, uniq, wc, cross-platform]
known_issues: []
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

- [ ] `@list ./src | wc -l` renders a bare number matching the actual file
      count.
- [ ] `<source> | grep <pattern> | @render list` filters correctly.
- [ ] A non-built-in utility in a pipe stage on a non-Windows fixture
      resolves through the shell allowlist; on a Windows-simulated fixture it
      is stripped with a WARN.

## Dependencies

19-composition-directives (pipe consumes composed/interpolated source
output), 21-cache (piped results are cacheable the same as direct directive
results).

## Known Issues

None.
