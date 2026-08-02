---
id: primitives-good
title: List Directive
type: COMPONENT
initiative: none
wave: test-w1
source_files:
  - src/directives/list.ts
status: complete
phase: all
last_synced: 2026-08-02
tags: [directives]
path: Directives / List
primitives:
  - name: "@list"
    kind: directive
  - name: render
    kind: cli-verb
---

## Interface Overview

The list-and-render pair is how a stage document pulls file data in and turns it into output. Reach for these when a document needs to show what exists on disk or produce its rendered form.

| Name | What it does |
|---|---|
| `@list` | List files in a directory, or rows from a JSON/CSV file. |
| `render` | Render a stage document to its output format. |

### @list
Lists files in a directory, or rows from a JSON/CSV file.

| Parameter | Values | Description |
|---|---|---|
| `match` | glob pattern | Filter entries by filename |

Example: `@list src/ match="*.ts"`

### render
Renders a stage document to its output format.

## API/Interface

Internal export map.

## Business Rules

- Globs resolve project-relative.
