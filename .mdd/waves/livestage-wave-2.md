---
id: livestage-wave-2
title: Data plane
initiative: livestage
initiative_version: 1
status: complete
depends_on: [livestage-wave-1]
demo_state: "A live-brief example document (@list + @read-frontmatter + @query git + @foreach + @render table) renders current project state in one CLI call; the same doc through the hook is identical; strip emits the degraded twin; --args \"sync\" flips an @if allowed(...) branch and a passive render takes the fallback branch; goldens green."
content_hash: 76b76c81c818
last_synced: 2026-08-01
---

# Wave 2: Data plane

The directive registry's read side: sources, compute, composition, render
formats, cache, pipe, args, and the fallback contract that makes strip and
timeout degradation work.

## Features

| id | feature | kind | depends_on |
|---|---|---|---|
| 14 | CR-6 Fallback Totality | SPEC | (none) |
| 15 | CR-10 Render Purity | SPEC | (none) |
| 16 | CR-11 Markdown Out | SPEC | (none) |
| 17 | Source Directives | COMPONENT | 09, 11, 10 |
| 18 | Compute Directives | COMPONENT | 10, 17 |
| 19 | Composition Directives | COMPONENT | 09, 17 |
| 20 | Render Formats | COMPONENT | 19, 16 |
| 21 | Cache | COMPONENT | 10 |
| 22 | Pipe | COMPONENT | 19, 21 |
| 23 | Arguments (F-ARGS) | COMPONENT | 19 |
| 24 | Fallback Contract | COMPONENT | 14, 11, 12 |
