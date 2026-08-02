---
id: livestage-wave-1
title: Foundation
initiative: livestage
initiative_version: 1
status: planned
depends_on: [livestage-wave-0]
demo_state: "livestage render examples/hello.stage returns pure markdown via CLI; the PreToolUse hook renders the same file on a simulated read and does NOT fire on hello.md containing directive-like text; livestage security show prints the strict policy; a non-allowlisted @query fails with a policy error; boundary lint and CR-1 scan green."
content_hash: 3add2e44aea4
last_synced: 2026-08-01
---

# Wave 1: Foundation

The package skeleton, the parser, the security core, extension routing, the
render trace, and the CLI router all land here, verified against the seeded
donor code, plus the five identity/isolation contracts that everything else in
the build assumes.

## Features

| id | feature | kind | depends_on |
|---|---|---|---|
| 02 | CR-1 Standalone Identity | SPEC | (none) |
| 03 | CR-2 One Package | SPEC | (none) |
| 04 | CR-3 Stage Only | SPEC | (none) |
| 05 | CR-4 No Daemon No Memory | SPEC | (none) |
| 06 | CR-5 Deny By Default | SPEC | (none) |
| 07 | Package Skeleton | COMPONENT | 01, 03 |
| 08 | Boundary Lint | COMPONENT | 07 |
| 09 | Grammar Parser | COMPONENT | 07 |
| 10 | Security Policy Core | COMPONENT | 07, 06 |
| 11 | Extension Routing (Hook) | COMPONENT | 09, 04 |
| 12 | Render Trace | COMPONENT | 07, 05 |
| 13 | CLI Router | COMPONENT | 07 |
