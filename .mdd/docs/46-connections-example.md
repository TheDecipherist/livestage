---
id: 46-connections-example
title: Connections Example
type: COMPONENT
path: Examples / Connections
source_files: [examples/connections/connections.stage, examples/connections/overlap.js]
status: planned
phase: idle
last_synced: 2026-08-01
initiative: livestage
wave: livestage-wave-6
depends_on: [36-frontmatter-query, 34-graph, 20-render-formats]
tags: [connections, live-index, overlap, mermaid-graph, generated-file-replacement]
known_issues: []
---

# Connections Example

## What to Build

`[new]`. `examples/connections/connections.stage`: the live replacement for a
generated cross-doc index. Composes `@date` + `@count` header, a path tree
via F-FM-QUERY projection + `@render tree` (feature 36), a dependency graph
via `@graph format=mermaid` with `{{ deps._edges }}`/`{{ deps._broken }}`
counts (feature 34), and source-file overlap as the canonical nested-array
`@code` script (`overlap.js`), with warnings from
`{{ deps._broken_list }}`.

## Architecture

"The doc that proves 'generated file' is a category LiveStage deletes"
(line 689). Deliberately composes four separate capabilities (sources,
frontmatter-query, graph, code) into one document to demonstrate they work
together, not just individually.

## Implementation Notes

`overlap.js` is the canonical example of the nested-array `@code` pattern
that F-FM-QUERY's `where` clause explicitly does NOT support (feature 36,
business rule 6): source-file overlap across documents requires walking
nested `source_files` arrays across many docs, which is exactly the case
the spec routes to `@code` instead of a directive.

## Data Model

N/A (consumes the live `.mdd/docs/` corpus of whatever project it runs
against, including this project's own docs once written).

## API/Interface

N/A. Rendered via `livestage render examples/connections/connections.stage`.

## Business Rules

1. Header: `@date` + `@count` over the doc corpus (line 683-684).
2. Path tree: F-FM-QUERY projection (feature 36) piped to `@render tree`
   (line 684).
3. Dependency graph: `@graph format=mermaid` with `{{ deps._edges }}`/
   `{{ deps._broken }}` counts surfaced in prose (line 684-686).
4. Source-file overlap: computed in `overlap.js`, a policy-granted `@code`
   script, as the canonical nested-array pattern (line 686-687).
5. Warnings surfaced from `{{ deps._broken_list }}` (line 687).

## Acceptance Criteria

- [ ] Golden snapshot over a fixture doc corpus renders correctly (accept
      criterion, line 688-690).
- [ ] Planting a broken `depends_on` (pointing at a nonexistent doc id) flips
      the rendered warnings section (line 689-690).
- [ ] Planting an overlapping `source_files` entry across two fixture docs
      flips the overlap section's output (line 690).

## Dependencies

36-frontmatter-query (path tree projection), 34-graph (mermaid dependency
graph), 20-render-formats (tree/table rendering).

## Known Issues

None.
