---
id: 14-cr6-fallback-totality
title: "CR-6: Fallback Totality"
type: SPEC
path: Contracts / Fallback Totality
source_files: []
status: complete
phase: all
last_synced: 2026-08-01
initiative: livestage
wave: livestage-wave-2
depends_on: []
tags: [contract, fallback, graceful-degradation, registry-test, strip]
known_issues:
  - "Satisfied by feature 24 (Fallback Contract): stripNode's switch in stripper.ts handles every directive the parser registry declares, proven by tests/unit/engine/fallback-registry.test.ts (27 tests, one real fixture per registered directive plus a synthetic unhandled-type case proving the check is not vacuous). There is no separate {directive, fallbackText} data table; the switch itself is the registry, see 24's known_issues for the full reasoning."
---

# CR-6: Fallback Totality

## What to Build

A behavior contract: every directive in the registry declares static fallback
text. A registry-iterating test fails on any directive without one, so a new
directive cannot ship uncovered.

## Architecture

Directly satisfied by feature 24 (Fallback Contract), which owns the
per-directive fallback registry that `strip` and the hook's timeout
degradation both read from.

## Implementation Notes

This is Principle 8 made checkable: "Graceful absence is a contract. Every
directive declares static fallback text. A `.stage` file read without the
engine, or after a render timeout, is a usable runbook that says it is
degraded" (line 116-118). "Never let a new directive ship without fallback
text (the registry test exists so this is impossible)" (line 851-852).

## Data Model

N/A (the fallback registry's shape is owned by feature 24).

## API/Interface

N/A. Satisfied by feature 24 plus a registry-iterating test owned by feature
42 (Contract Scans).

## Business Rules

1. Every directive in the registry (spec table, lines 331-351) declares
   static fallback text.
2. A registry-iterating test fails if any directive lacks one (line 736-737).

## Acceptance Criteria

- [x] A test iterates the directive registry and asserts every entry is
      handled. "Non-empty fallback definition" as literally worded does not
      hold: most directives' correct fallback IS the empty string (their
      output vanishes, only prose survives), a deliberate design choice, not
      a gap. `tests/unit/engine/fallback-registry.test.ts`.
- [x] Adding a new directive without a fallback fails this test: proven by a
      synthetic node type with no `stripNode` case, which throws `"unhandled
      AST node type"` as asserted in the same test file.

## Dependencies

None.

## Known Issues

See the frontmatter `known_issues` above: satisfied by feature 24's
switch-based fallback registry, not a separate data table.
