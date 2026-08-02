---
id: 46-connections-example
title: Connections Example
type: COMPONENT
path: Examples / Connections
source_files: [examples/connections/connections.stage, examples/connections/overlap.js,
  examples/connections/.livestage/policy.json, src/engine/graph.ts,
  src/renderer/formats/tree.ts]
test_files: [tests/e2e/connections-example.test.ts]
status: complete
phase: all
last_synced: 2026-08-02
initiative: livestage
wave: livestage-wave-6
depends_on: [36-frontmatter-query, 34-graph, 20-render-formats]
tags: [connections, live-index, overlap, mermaid-graph, generated-file-replacement]
known_issues:
  - "Ships its own fixture doc corpus (examples/connections/corpus/, 5 small
    docs) rather than pointing at this project's own .mdd/docs/: the
    acceptance criteria specifically require planting a broken depends_on
    and an overlapping source_files entry to prove the graph/overlap
    sections react, which means deliberately corrupting a corpus, not
    something to do to this project's real doc corpus. The fixture
    directory is named corpus/, not docs/, since frontmatter-validate.sh
    enforces this project's own MDD doc schema on any */docs/*.md path
    (found live: the hook fired on the fixture docs on first write,
    correctly, since they don't carry LiveStage's own MDD frontmatter
    schema and aren't meant to)."
  - "Building this example found a real, previously-undiscovered bug in
    graph.ts: readFrontmatterField documents (and correctly implements)
    returning an inline YAML list's brackets intact (\"field: [a, b]\" comes
    back as the literal string \"[a, b]\", not \"a, b\", so {{ field }}
    interpolation shows the raw list). graph.ts's own splitListField never
    stripped those brackets before comparing edge targets against known
    node ids, so depends_on: [x] (inline-list syntax, one dependency) made
    every such edge look broken, the target being compared was literally
    the string \"[x]\", never \"x\". Undetected until now because feature
    34's own wave-5 live verification only tested a bare scalar depends_on:
    c, never the inline-list form. Fixed in splitListField (strip one layer
    of brackets before splitting), not in readFrontmatterField (other
    callers rely on its documented raw-brackets behavior)."
  - "Also fixed src/renderer/formats/tree.ts: a breadcrumb sourced from a
    path: field written the way this project's OWN docs are (\"Core /
    Parser\", spaced for readability) split into segments like \"Core \" and
    \" Parser\" (untrimmed), two different-looking tree nodes for one
    level. Found live rendering this example's own path tree against its
    fixture corpus, whose path: fields intentionally match this project's
    real convention. Fixed by trimming each segment in tree.ts's insert()."
  - "@count cannot be embedded mid-sentence (\"Corpus: @count ... /
    documents\"): directives are line-level constructs (must start their
    own line), the same rule that governs every other directive. The first
    draft of connections.stage got this wrong and rendered the literal
    directive text inline; fixed by using label=/visible=\"false\" plus a
    {{ docCount }} interpolation in the following prose line, the same
    pattern @date and other source directives already use for inline
    prose references."
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

- [x] Golden snapshot over a fixture doc corpus renders correctly (accept
      criterion, line 688-690). Live-verified against
      examples/connections/corpus/ (5 docs); tests/e2e/connections-example.test.ts::"renders
      the header, path tree, graph, and overlap sections correctly".
- [x] Planting a broken `depends_on` (pointing at a nonexistent doc id) flips
      the rendered warnings section (line 689-690). Live-verified;
      tests/e2e/connections-example.test.ts::"the planted broken depends_on
      is reported...", plus a reverse check that fixing the plant removes
      the warning.
- [x] Planting an overlapping `source_files` entry across two fixture docs
      flips the overlap section's output (line 690). Live-verified;
      tests/e2e/connections-example.test.ts::"the planted source_files
      overlap is reported", plus the same reverse check.

## Dependencies

36-frontmatter-query (path tree projection), 34-graph (mermaid dependency
graph), 20-render-formats (tree/table rendering).

## Known Issues

None.
