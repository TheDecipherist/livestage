---
id: bad-unsatisfied
title: Bad Unsatisfied
type: COMPONENT
initiative: none
wave: test-w1
source_files:
  - src/u.ts
status: active
phase: implement
last_synced: 2026-07-10
depends_on: [provider]
tags: [unsat]
path: Bad / Unsat
---

Fixture: depends on the provider, which declares a mandatory resolveColumn
contract, but carries no satisfies_contracts entry. Must block.
