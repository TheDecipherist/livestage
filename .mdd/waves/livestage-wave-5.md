---
id: livestage-wave-5
title: Frontmatter engine + determinism
initiative: livestage
initiative_version: 1
status: complete
depends_on: [livestage-wave-4]
demo_state: "A schema declares the project's doc class; an @update-frontmatter violating it is blocked pre-write with a named error; a conforming update lands atomically; @graph renders the dependency tree and reports a planted cycle; a one-line @list ... where=... fields=... | @render table renders the filtered multi-column status table over a 25-doc fixture corpus; two --deterministic renders of the suite are byte-identical."
content_hash: fdaa3c1d512d
last_synced: 2026-08-01
---

# Wave 5: Frontmatter engine + determinism

Schema-validated frontmatter writes, the dependency graph with cycle
detection, byte-identical deterministic rendering, and the frontmatter-query
surface (F-FM-QUERY) that turns a 100-execution `@foreach` into one line.

## Features

| id | feature | kind | depends_on |
|---|---|---|---|
| 32 | Schema Engine | COMPONENT | 17, 10 |
| 33 | Update Frontmatter | COMPONENT | 32 |
| 34 | Graph | COMPONENT | 32, 20 |
| 35 | Determinism | COMPONENT | 21, 18 |
| 36 | Frontmatter Query | COMPONENT | 17, 32, 20 |
