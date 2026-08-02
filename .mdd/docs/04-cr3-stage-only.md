---
id: 04-cr3-stage-only
title: "CR-3: Stage Only"
type: SPEC
path: Contracts / Stage Only
source_files: []
status: complete
phase: all
last_synced: 2026-08-01
initiative: livestage
wave: livestage-wave-1
depends_on: []
tags: [contract, extension-routing, hook, no-content-sniffing, ci-scan]
known_issues:
  - "Found and fixed a real gap while verifying business rule 4: validate never flagged an unregistered/passthrough directive as an error, so a document full of retired directives (@phase, @db, ...) validated clean despite parsing to unknown/passthrough nodes correctly. Fixed in src/cli/commands/validate.ts (feature 09's known issues has the same entry, it is one fix serving both docs); covered by tests/unit/cli/cli-validate.test.ts."
  - "The donor's src/hook/hook.ts (content-sniffed .md for a leading @markdownai marker, routed to a nonexistent 'mcp' target, the exact opposite of this contract) is deleted and replaced by feature 11's src/hook/pretooluse.ts, which routes on a pure .stage extension match."
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

- [x] Grep/AST scan across `src/` finds no file-type routing decision keyed on
      anything but the `.stage` extension. Verified: the only remaining `.md`
      references are an unrelated hardcoded stdlib filename and a CLI flag
      name, neither is a routing decision.
- [x] Hook test matrix: a `.md` fixture containing directive-like text (e.g.
      `@query "rm -rf /"`) round-trips through the hook unmodified.
      `tests/unit/hook/pretooluse.test.ts`, "a .md file is never routed to
      the engine, returns no substitution".
- [x] A `.stage` fixture containing a retired directive (`@phase`, `@db`,
      `@http`, ...) fails `validate`/`render` as an unknown directive.
      `validate` hard-fails with "unknown directive" (fixed, see Known
      Issues); `render` never silently executes it, it surfaces as literal
      unrecognized text (visibly wrong output, per CR-6 Fallback Totality,
      not a silent success).

## Dependencies

None.

## Known Issues

None.
