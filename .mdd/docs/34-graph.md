---
id: 34-graph
title: Graph
type: COMPONENT
path: Directives / Graph
source_files: [src/parser/directives/graph.ts]
status: planned
phase: idle
last_synced: 2026-08-01
initiative: livestage
wave: livestage-wave-5
depends_on: [32-schema-engine, 20-render-formats]
tags: [graph, dependency-tree, cycle-detection, mermaid, broken-edges]
known_issues: []
---

# Graph

## What to Build

`[verify->extend]`, copy and extend the donor's native relation-edge
implementation. `@graph`: relation fields, `format=tree|table|mermaid`,
`label`. Native edges, cycle + broken-edge detection. NEW output
`format=mermaid` emits a fenced ` ```mermaid ` block (pure markdown per
CR-11, feature 16) with per-node status classDefs. Structured counts
(`_nodes`, `_edges`, `_cycles`, `_broken`, `_broken_list`) capturable.

## Architecture

Reads frontmatter relation fields (schema-validated via feature 32) and
renders via feature 20's format machinery (tree/table) or its own new
mermaid fence generator.

## Implementation Notes

`format=mermaid` is the one genuinely new output mode this wave adds to
`@graph`; tree and table formats are `[verify]` from the donor. The mermaid
block is still plain markdown syntactically (a fenced code block that
happens to render as a diagram), satisfying CR-11 without being a special
case (line 643-644).

## Data Model

Structured result: `{ _nodes: number, _edges: number, _cycles: number,
_broken: number, _broken_list: string[] }`, following the `@test`/`@code`
result pattern (label-capturable for `{{ }}`) (line 644-645).

## API/Interface

`@graph <relation fields> format=tree|table|mermaid label=` (line 351,
640-645).

## Business Rules

1. Native edges are read from frontmatter relation fields (e.g.
   `depends_on`, `relates`), schema-validated.
2. Cycle detection and broken-edge detection both run on every `@graph`
   call (line 351, 641).
3. `format=mermaid` emits a fenced ` ```mermaid ` block with per-node status
   classDefs (line 642-644).
4. Structured counts (`_nodes`, `_edges`, `_cycles`, `_broken`,
   `_broken_list`) are label-capturable (line 644-645).

## Acceptance Criteria

- [ ] `@graph` renders the dependency tree over a fixture corpus and
      reports a planted cycle (Wave 5 demo-state, line 632-633).
- [ ] `format=mermaid` output is a valid fenced markdown code block
      containing mermaid syntax with status classDefs.
- [ ] `{{ deps._cycles }}`/`{{ deps._broken }}` resolve correctly when
      `@graph ... label=deps` is used.
- [ ] A planted broken edge (a `depends_on` pointing at a nonexistent doc id)
      is reported in `_broken_list`.

## Dependencies

32-schema-engine (relation fields are schema-validated frontmatter),
20-render-formats (tree/table output modes).

## Known Issues

None.
