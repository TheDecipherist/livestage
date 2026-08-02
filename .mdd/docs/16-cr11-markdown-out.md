---
id: 16-cr11-markdown-out
title: "CR-11: Markdown Out"
type: SPEC
path: Contracts / Markdown Out
source_files: []
status: complete
phase: all
last_synced: 2026-08-01
initiative: livestage
wave: livestage-wave-2
depends_on: []
tags: [contract, pure-markdown, output-contract, registry-test, gfm]
known_issues:
  - "Checked @graph specifically since it returns node.raw in both render (engine.ts) and strip (stripper.ts): raw is the directive's bare ARGUMENT text (GraphNode's raw = input.rawArgs), not the '@graph ...' line itself, so a live check (@graph plan.md /) rendered just 'plan.md', no '@'-prefixed syntax. Not a CR-11 violation, just an inert not-yet-implemented stub (feature 34, wave 5, owns the real behavior). All nine @render formats (feature 20) are clean, spot-checked live plus tests/unit/renderer/renderer.test.ts (18 tests); the real registry-iterating test across every format and strip path is feature 42's job (Contract Scans, wave 6), not built yet."
  - "Feature 42 built the real registry-iterating test
    (tests/golden/markdown-out.test.ts): every directive in the parser
    registry, rendered for real (not stripped) against fixtures that
    actually resolve, asserted clean of @-prefixed syntax. 30/30 pass on
    the first run, including @graph (now fully implemented, feature 34)
    and a dedicated check that @graph format=mermaid output is a single,
    well-formed fenced code block."
---

# CR-11: Markdown Out

## What to Build

A behavior contract: rendered and stripped output of every corpus document is
pure markdown containing zero directive syntax. A registry-iterating test
checks every format.

## Architecture

Satisfied jointly by feature 20 (Render Formats, the nine markdown shapes a
pipeline can end in) and feature 24 (Fallback Contract, whose strip output
must also be pure markdown).

## Implementation Notes

"Output is pure markdown. No directive syntax survives a render or a strip"
(Principle 9, line 119). All `@render` formats emit plain markdown constructs:
GFM tables, fenced blocks, lists (line 326-327). This includes the mermaid
output of `@graph format=mermaid` (feature 34): a fenced ` ```mermaid ` block
is still plain markdown syntactically, even though it renders as a diagram
(line 643-644).

## Data Model

N/A.

## API/Interface

N/A. Satisfied by feature 20's format implementations plus a registry-
iterating test (feature 42).

## Business Rules

1. Rendering resolves every directive and emits pure markdown (line 325-326).
2. All `@render` formats emit plain markdown constructs: GFM tables, fenced
   blocks, lists (line 326-327).
3. No directive syntax survives render or strip (line 327-328, CR-11).

## Acceptance Criteria

- [x] A registry-iterating test renders a fixture using every `@render`
      format and asserts no `@`-prefixed directive syntax survives. Built
      this wave: tests/golden/markdown-out.test.ts renders every registered
      directive for real (30 directives, real fixture files) and asserts
      the output is clean.
- [x] The same check runs against `strip` output for every directive:
      `tests/unit/engine/fallback-registry.test.ts` (feature 24) exercises
      strip against every registered directive; none leak `@`-prefixed
      syntax (verified by inspection of stripNode's cases, all return `''`
      or plain data, never raw directive source, `graph`/`passthrough`
      checked specifically, see Known Issues).
- [x] `@graph format=mermaid` output is confirmed to be a valid fenced
      markdown code block (not raw mermaid outside a fence). @graph is now
      fully implemented (feature 34, wave 5);
      tests/golden/markdown-out.test.ts::"@graph format=mermaid output is a
      valid fenced markdown code block..." asserts exactly one fence pair
      and correct open/close markers.

## Dependencies

None.

## Known Issues

See the frontmatter `known_issues` above: `@graph`'s stub behavior checked
and confirmed harmless, the real registry test deferred to feature 42.
