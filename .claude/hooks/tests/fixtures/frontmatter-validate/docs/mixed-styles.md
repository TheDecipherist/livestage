---
id: mixed-styles
title: a long title that
  wraps onto a second line
type: COMPONENT
initiative: none
wave: test-w1
source_files: [src/directives/mix.ts,
  src/directives/mix-helpers.ts]
test_files: [tests/directives/mix.test.ts]
status: complete
phase: all
last_synced: 2026-08-02
tags: [directives, mixed]
primitives:
  - { name: "@mix", kind: directive }
known_issues:
  - "[deferred] flow-style docs render slowly on huge files,
    revisit after the render cache lands"
path: Directives / Mix
---

## Interface Overview

Mixing data sources into one stage document is what @mix is for. Reach for
it when two inputs need to become one output block.

| Name | What it does |
|---|---|
| `@mix` | Merge two data sources into one block. |

### @mix
Merges two data sources. Example: `@mix a.json b.json`

## API/Interface

Internal export map.

## Business Rules

- Inputs resolve project-relative.
