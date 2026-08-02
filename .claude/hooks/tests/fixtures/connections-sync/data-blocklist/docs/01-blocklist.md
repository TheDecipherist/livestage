---
id: 01-blocklist
title: Block List Field Order
type: COMPONENT
status: planned
source_files:
  - src/a.ts
  - src/b.ts
path: Engine / Block List
depends_on: []
tags: [test]
last_synced: 2026-07-09
---

Regression fixture for the connections-gen frontmatter parser. `path` sits
immediately after the `source_files` block list. The old parser dropped the
field right after a block list (an off-by-one: it set i past the block, then
the trailing i++ overshot by one), so `path` went missing and the generator
emitted a spurious "missing path" warning. The fixed parser (a `continue`
after the block-list branch) reads `path` correctly, so the generator emits
zero warnings and the connections-sync hook stays silent.
