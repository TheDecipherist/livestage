---
id: bad-verified-at
title: Bad Verified At
type: COMPONENT
initiative: none
wave: test-w1
source_files:
  - src/bva.ts
status: complete
phase: all
last_synced: 2026-07-10
depends_on: [provider]
satisfies_contracts:
  - from: provider
    function: resolveColumn
    when: always
    status: done
    verified_at: 2026-07-22
tags: [badverifiedat]
path: Bad / VerifiedAt
---

Fixture: a done contract whose verified_at is a bare date, not a test locator. Must block.
