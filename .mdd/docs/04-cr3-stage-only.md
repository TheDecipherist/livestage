---
id: 04-cr3-stage-only
title: "CR-3: Stage Only"
type: SPEC
path: Contracts / Stage Only
source_files: []
status: planned
phase: idle
last_synced: 2026-08-01
initiative: livestage
wave: livestage-wave-1
depends_on: []
tags: [contract, extension-routing, hook, no-content-sniffing, ci-scan]
known_issues: []
---

# CR-3: Stage Only

## What to Build

A behavior contract: no code path parses or executes any non-`.stage` file.
`.md` appears in routing code only as `strip` output handling. The hook test
matrix must prove a `.md` file full of directive-like text is never routed to
the engine.

## Architecture

This is the contract that feature 11 (Extension Routing / Hook) exists to
satisfy: the PreToolUse hook fires on a pure `.stage` extension match, nothing
else, no content sniffing, no magic header, no byte peeking (spec line 64-66,
Why This Shape).

## Implementation Notes

The spec is explicit that this is a load-bearing design decision, not an
incidental default: "Extension routing kills the detection problem" (line 64).
A document containing an excluded donor directive (`@phase`, `@db`, `@http`,
etc.) must fail as an unknown directive, never be silently ignored or
special-cased (line 353-361, 610-611).

## Data Model

N/A.

## API/Interface

N/A. Satisfied by feature 11's hook implementation plus feature 42's scan and
hook test matrix.

## Business Rules

1. No code path parses or executes any non-`.stage` file (line 720-721).
2. `.md` appears in routing code only as `strip` output handling (line
   721-722).
3. A `.md` file full of directive-like text is returned untouched by the hook
   (line 722-723, also the Wave 1 demo-state, line 568-569).
4. Nothing outside the directive registry parses; a document containing a
   removed donor directive fails as an unknown directive (line 610-611).

## Acceptance Criteria

- [ ] Grep/AST scan across `src/` finds no file-type routing decision keyed on
      anything but the `.stage` extension.
- [ ] Hook test matrix: a `.md` fixture containing directive-like text (e.g.
      `@query "rm -rf /"`) round-trips through the hook unmodified.
- [ ] A `.stage` fixture containing a retired directive (`@phase`, `@db`,
      `@http`, ...) fails `validate`/`render` as an unknown directive.

## Dependencies

None.

## Known Issues

None.
