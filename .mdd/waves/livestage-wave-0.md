---
id: livestage-wave-0
title: Seed
initiative: livestage
initiative_version: 1
status: planned
depends_on: []
demo_state: "Repo compiles; merged suite runs (failures only in excluded areas); CR-1 grep clean or remaining hits enumerated as Wave 1 tasks."
content_hash: ea2ccc5a8a0f
last_synced: 2026-08-01
---

# Wave 0: Seed

Run by hand, once, before any wave agent work starts. Produces the repo in its
final layout by copying the donor codebase, excluding entire subsystems,
merging test suites, renaming the brand, and doing a mechanical pass of the
donor's feature-doc corpus into `.mdd/docs/`.

## Features

| id | feature | kind | depends_on |
|---|---|---|---|
| 01 | Seed Script | task | (none) |
