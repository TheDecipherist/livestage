---
id: 16-cr11-markdown-out
title: "CR-11: Markdown Out"
type: SPEC
path: Contracts / Markdown Out
source_files: []
status: planned
phase: idle
last_synced: 2026-08-01
initiative: livestage
wave: livestage-wave-2
depends_on: []
tags: [contract, pure-markdown, output-contract, registry-test, gfm]
known_issues: []
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

- [ ] A registry-iterating test renders a fixture using every `@render`
      format (`table|tree|list|numbered|bar|code|json|inline|links`) and
      asserts the output contains no `@`-prefixed directive syntax.
- [ ] The same test runs against `strip` output for every directive.
- [ ] `@graph format=mermaid` output is confirmed to be a valid fenced
      markdown code block (not raw mermaid outside a fence).

## Dependencies

None.

## Known Issues

None.
