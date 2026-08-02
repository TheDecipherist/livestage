---
generated: 2026-07-05
doc_count: 2
connection_count: 1
overlap_count: 0
---

# MDD Connections

## Path Tree

**X/Y**
  └── `01-a` - A (done)
**X/Z**
  └── `02-b` - B (active)

## Dependency Graph

```mermaid
graph TD
  classDef planned fill:#aaa,stroke:#666,color:#000
  classDef active fill:#ffd700,stroke:#b8860b,color:#000
  classDef done fill:#00e5cc,stroke:#008080,color:#000
  classDef deprecated fill:#f44,stroke:#a00,color:#fff
  01_a["01-a"]:::done
  02_b["02-b"]:::active
  02_b --> 01_a
```

## Source File Overlap

Files referenced by 2+ docs:

(none)

## Warnings

- broken depends_on: 01-a references 99-missing (no such doc)
