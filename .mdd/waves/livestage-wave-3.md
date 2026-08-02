---
id: livestage-wave-3
title: Verification
initiative: livestage
initiative_version: 1
status: planned
depends_on: [livestage-wave-2]
demo_state: "An assertion doc against a fixture tree goes green; deleting the target files flips contains-class assertions to FAIL (not vacuous green); validate refuses an all-inert doc, warns on a double-escaped regex, and fails a document containing @phase as an unknown directive; livestage assert exits 1 in a CI fixture repo with only the bundle present."
content_hash: 94069ef7157f
last_synced: 2026-08-01
---

# Wave 3: Verification

`@assert`, the six operators and their vacuity semantics, validate-time
liveness checking, and the CI exit-code contract that makes `livestage assert`
usable as a gate.

## Features

| id | feature | kind | depends_on |
|---|---|---|---|
| 25 | CR-7 Suite Baseline | SPEC | (none) |
| 26 | Assert Operators | COMPONENT | 17, 18, 19 |
| 27 | Assert Liveness | COMPONENT | 26 |
| 28 | CI Mode | COMPONENT | 26, 13 |
