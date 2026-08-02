---
id: livestage-wave-4
title: Code + Doctor
initiative: livestage
initiative_version: 1
status: complete
depends_on: [livestage-wave-3]
demo_state: "A .stage doc runs a Python block that emits JSON; {{ analysis.total }} renders and @render table shows its rows; with python removed from the policy, validate fails the doc at authoring time and render fails at runtime; doctor prints one healthy line, --json validates against its schema, --rules-for answers for a fixture file."
content_hash: 59afb31e22e0
last_synced: 2026-08-01
---

# Wave 4: Code + Doctor

`@code` under policy, the always-block carve-out for engine-built runner
invocations, `doctor`'s health probes, and the all-or-nothing `init` installer.

## Features

| id | feature | kind | depends_on |
|---|---|---|---|
| 29 | Code Runners | COMPONENT | 10, 18 |
| 30 | Doctor | COMPONENT | 10, 12, 29, 27 |
| 31 | Init | COMPONENT | 10, 11, 30 |
