---
id: 34-graph
title: Graph
type: COMPONENT
path: Directives / Graph
source_files: [src/parser/directives/graph.ts, src/engine/graph.ts]
status: complete
phase: all
last_synced: 2026-08-02
initiative: livestage
wave: livestage-wave-5
depends_on: [32-schema-engine, 20-render-formats]
tags: [graph, dependency-tree, cycle-detection, mermaid, broken-edges]
known_issues:
  - "PARTIALLY RESOLVED (2026-08-02, post-initiative known_issues sweep):
    every OTHER scalar frontmatter field on a graphed doc (status, etc.) is
    now checked against its declared class's schema when @graph builds the
    node set, warning (not blocking, reads must stay pure) on a violation.
    tests/unit/engine/graph-schema.test.ts. What remains genuinely unfixed:
    the relation field itself (depends_on etc.) is still read raw via
    readFrontmatterField with no validation, because the schema vocabulary
    (src/engine/schema/loader.ts's SchemaField) has no array/list type at
    all, only string/number/boolean with an optional enum. Validating a
    relation field's shape would mean inventing a new schema concept (a
    list-of-ids field type, or a separate edge-shape validator) that
    doesn't exist anywhere in F-SCHEMA yet; scoped out of this fix as a
    schema-engine-level gap, not a graph-level one."
  - "The donor's `@graph` mechanism was a fenced ```mai-graph code block with
    manually-written `A --> B` edge text, unrelated to this feature's native
    frontmatter-edge model and carrying the excluded donor brand name in its
    fence language. Removed entirely from src/parser/parser.ts (the
    special-case that produced a GraphNode from that fence) rather than kept
    alongside the new directive; the 3 tests that exercised it were rewritten
    to exercise `@graph target=.../ ` instead
    (tests/unit/parser/parser-directives.test.ts,
    tests/unit/engine/stripper.test.ts, tests/unit/cli/cli-sources.test.ts)."
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

- [x] `@graph` renders the dependency tree over a fixture corpus and
      reports a planted cycle (Wave 5 demo-state, line 632-633). Live-verified
      against a planted a-to-b-to-c-to-a cycle plus an unrelated node d with a
      broken edge at /tmp/ls-graph-demo/; also covered by
      tests/unit/cli/cli-sources.test.ts::"@graph renders a tree of native
      depends_on edges from frontmatter /".
- [x] `format=mermaid` output is a valid fenced markdown code block
      containing mermaid syntax with status classDefs. Live-verified;
      tests/unit/cli/cli-sources.test.ts::'@graph format="mermaid" renders a
      fenced mermaid block /'.
- [x] `{{ deps._cycles }}`/`{{ deps._broken }}` resolve correctly when
      `@graph ... label=deps` is used. Live-verified in the same manual
      cycle/broken-edge fixture; src/engine/graph.ts::executeGraph sets
      ctx.data[node.label]._cycles/_broken.
- [x] A planted broken edge (a `depends_on` pointing at a nonexistent doc id)
      is reported in `_broken_list`. Live-verified in the same fixture
      (node d's edge to a nonexistent id appeared in `_broken_list`).

## Dependencies

32-schema-engine (relation fields are schema-validated frontmatter),
20-render-formats (tree/table output modes).

## Known Issues

None.
