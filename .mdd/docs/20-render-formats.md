---
id: 20-render-formats
title: Render Formats
type: COMPONENT
path: Renderer / Formats
source_files: [src/renderer/formats/table.ts, src/renderer/formats/tree.ts, src/renderer/formats/list.ts, src/renderer/formats/numbered.ts, src/renderer/formats/bar.ts, src/renderer/formats/code.ts, src/renderer/formats/json.ts, src/renderer/formats/inline.ts, src/renderer/formats/links.ts]
test_files: [tests/unit/renderer/renderer.test.ts]
status: complete
phase: all
last_synced: 2026-08-17
initiative: livestage
wave: livestage-wave-2
depends_on: [19-composition-directives, 16-cr11-markdown-out]
tags: [render-formats, pipe-sink, gfm-table, mermaid, plain-markdown]
known_issues:
  - "test_files was never backfilled (found empty 2026-08-17 during an
    unrelated fix's frontmatter validation); corrected above to
    tests/unit/renderer/renderer.test.ts, the real coverage for every
    format module in this doc."
primitives:
  - name: "@render"
    kind: directive
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

## Interface Overview

`@render` is how piped data becomes readable markdown instead of raw
tab-separated lines: point it at a shape (a table, a tree, a bulleted
list, a bar chart, and five more) and it formats whatever the pipe handed
it. It's always the last stage of a pipeline, taking the output of a
source directive like `@list` or `@query` and turning it into something a
person would actually want to read.

| Name | What it does |
|---|---|
| `@render` | Turns piped data into a markdown shape, table, tree, list, and six more. |

### @render

Always the last stage of a pipe: takes whatever a source directive produced
(optionally filtered through `grep`/`sort`/`head`/`tail`/`uniq`/`wc`) and
turns it into a specific markdown shape. `as="type"` on the source directive
itself is shorthand for `| @render type="type"`.

```stage
@list "src" match="*.ts" | @render type="table" /
```

| Parameter | Values | Description |
|---|---|---|
| `type` | `table` \| `tree` \| `list` \| `numbered` \| `bar` \| `code` \| `json` \| `inline` \| `links` | Which markdown shape to produce |
| `columns` | `col1,col2` | Column headers, for `table` |
| `lang` | language name | Fence language, for `code` |
| `compact` | `true`, for `table` | Skip column-width padding: no alignment, one space per cell, for output read as raw text rather than through a markdown viewer |

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

- [x] Each of the nine formats renders correctly against donor-copied
      fixture tests: `tests/unit/renderer/renderer.test.ts` (18 tests,
      covers list, numbered, links, table, code, inline, bar, tree, json,
      plus unknown-type error handling).
- [x] `as="table"` (etc.) on a source directive produces output identical to
      the equivalent explicit `| @render type="table"` pipeline. Live-
      verified byte-for-byte identical.
- [x] `flow`, `timeline`, and `row` formats do not exist in
      `src/renderer/formats/`: confirmed by directory listing, exactly the
      nine documented formats and nothing else.
- [!] Registry-iterating markdown-purity test (CR-11, feature 16) is not
      built yet; owned by feature 42 (Contract Scans, wave 6). Spot-checked
      here instead (all nine formats, no `@`-prefixed directive syntax in
      output); the real registry-iterating version is feature 16/42's job,
      see 16's doc.

## Dependencies

19-composition-directives (formats consume piped/interpolated data), 16-cr11-
markdown-out (this component is what makes CR-11 true for the render
surface).

## Known Issues

The real registry-iterating CR-11 test (every format, asserting zero `@`-
prefixed syntax survives) is deferred to feature 42; a manual spot-check of
all nine formats against a live render found nothing, but it is not
permanent test coverage.

## Bug Fixes

### B1 (fixed 2026-08-17)
Symptom: `@render type="table"` always padded every cell to its column's
max width, valid GFM alignment that any markdown viewer collapses
visually, but pure noise (hundreds of trailing spaces per line) when the
rendered file is read as raw text rather than through a viewer, exactly
how `CLAUDE.md` is consumed by Claude Code. A single wide outlier cell
(the `bundle` script's long esbuild command, in `CLAUDE.md`'s own
Commands table) padded every other row to match. Found live, 2026-08-17.
Cause: `table.ts` had no opt-out of its `widths`/`padEnd` alignment step.
Fix: `src/renderer/formats/table.ts` (`compact="true"` skips padding
entirely: one space per cell, `---` separator, still valid GFM; default
behavior, every other existing table render, unchanged) | Regression
test: tests/unit/renderer/renderer.test.ts
