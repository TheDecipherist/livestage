---
id: primitives-jargon
title: Jargon Overview
type: COMPONENT
initiative: none
wave: test-w1
source_files:
  - src/directives/hash.ts
status: complete
phase: all
last_synced: 2026-08-02
tags: [directives]
path: Directives / Hash
primitives:
  - name: "@hash"
    kind: directive
---

## Interface Overview

Hashing gives a document a stable fingerprint of its source files, so staleness is detectable at a glance.

| Name | What it does |
|---|---|
| `@hash` | Hash a file's content. |

### @hash
Hashes a file's content, added in feature 33 per CR-11 (line 482).

## API/Interface

Internal export map.

## Business Rules

- Excludes self-referencing lines.
