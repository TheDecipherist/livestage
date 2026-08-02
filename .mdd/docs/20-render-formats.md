---
id: 20-render-formats
title: Render Formats
type: COMPONENT
path: Renderer / Formats
source_files: [src/renderer/formats/table.ts, src/renderer/formats/tree.ts, src/renderer/formats/list.ts, src/renderer/formats/numbered.ts, src/renderer/formats/bar.ts, src/renderer/formats/code.ts, src/renderer/formats/json.ts, src/renderer/formats/inline.ts, src/renderer/formats/links.ts]
status: planned
phase: idle
last_synced: 2026-08-01
initiative: livestage
wave: livestage-wave-2
depends_on: [19-composition-directives, 16-cr11-markdown-out]
tags: [render-formats, pipe-sink, gfm-table, mermaid, plain-markdown]
known_issues: []
---

# Render Formats

## What to Build

`[verify]`, copy from
`~/projects/markdownai/packages/renderer/src/formats/*`. The nine `@render`
formats: `table`, `tree`, `list`, `numbered`, `bar`, `code`, `json`, `inline`,
`links`. `@render` is always the pipe SINK, never standalone: it is the last
stage of a pipeline and chooses the markdown shape of the piped data. `flow`,
`timeline`, and `row` renderer formats from the donor must NOT exist (`row`'s
only consumer was the retired `@db as=row`).

## Architecture

Every source/compute directive that ends in `| @render <type>` or uses
`as="type"` shorthand routes through this component. Must satisfy CR-11
(feature 16): every format emits plain markdown constructs only.

## Implementation Notes

`as="type"` on any source is shorthand for appending `| @render type`
(line 349). All output is plain markdown constructs: GFM tables, fenced
blocks, lists (line 326-327, 349).

## Data Model

N/A (formats are pure functions from piped data to a markdown string).

## API/Interface

`@render type=table|tree|list|numbered|bar|code|json|inline|links` (line
349). Pipe sink syntax: `<source> | [grep/sort/head/tail/uniq/wc]* | @render
<type>`.

## Business Rules

1. `@render` is the pipe SINK, never standalone (line 349).
2. `as="type"` is shorthand for `| @render type` (line 349).
3. All nine formats emit plain markdown constructs only (line 326-327,
   CR-11).
4. `flow`, `timeline`, and `row` formats must not exist in this build
   (line 593-594): `row`'s only consumer was the retired `@db as=row`
   directive, and `flow`/`timeline` supported the retired workflow-spine
   directives.

## Acceptance Criteria

- [ ] Each of the nine formats renders correctly against donor-copied
      fixture tests, producing valid GFM/markdown output.
- [ ] `as="table"` (etc.) on a source directive produces output identical to
      the equivalent explicit `| @render table` pipeline.
- [ ] A scan/test confirms `flow`, `timeline`, and `row` formats do not exist
      in `src/renderer/formats/`.
- [ ] Registry-iterating markdown-purity test (CR-11, feature 16) passes for
      all nine formats.

## Dependencies

19-composition-directives (formats consume piped/interpolated data), 16-cr11-
markdown-out (this component is what makes CR-11 true for the render
surface).

## Known Issues

None.
