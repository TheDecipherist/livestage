---
id: livestage-wave-6
title: Pattern, bundle, enforcement floor
initiative: livestage
initiative_version: 1
status: planned
depends_on: [livestage-wave-5]
demo_state: "The multi-step example renders green in sequence and red out of sequence, state round-trips through schema-validated frontmatter; dist/livestage.js alone passes the bare-checkout e2e; hook cold render of a trivial doc under 200 ms; every CR scan and suite green; all migrated docs verified (CR-9 clean)."
content_hash: 643fb396415c
last_synced: 2026-08-01
---

# Wave 6: Pattern, bundle, enforcement floor

The worked multi-step example, the esbuild single-file bundle, the full CR
contract-scan suite, the remaining doc verifications, the migrated examples and
user guide, the connections example, and the two reach-via-code worked
examples. There is no Wave 7: external reach beyond the filesystem and the
allowlisted shell is `@code` under policy, not a directive tier.

## Features

| id | feature | kind | depends_on |
|---|---|---|---|
| 37 | CR-8 Bare Checkout | SPEC | (none) |
| 38 | CR-9 Doc Corpus Integrity | SPEC | (none) |
| 39 | CR-D7 Reuse Fidelity | SPEC | (none) |
| 40 | Pattern Example | COMPONENT | 19, 24, 33 |
| 41 | Bundle | COMPONENT | 07, 13 |
| 42 | Contract Scans | COMPONENT | 02, 03, 04, 05, 06, 14, 15, 16, 25, 37, 38, 39 |
| 43 | Doc Verification Closeout | task | 38 |
| 44 | Examples Showcase | COMPONENT | 20, 24, 02 |
| 45 | User Guide | COMPONENT | 02, 40 |
| 46 | Connections Example | COMPONENT | 36, 34, 20 |
| 47 | Reach Via Code | COMPONENT | 29 |
