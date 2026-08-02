---
id: good
title: Good Consumer
type: COMPONENT
initiative: none
wave: test-w1
source_files:
  - src/good.ts
status: complete
phase: all
last_synced: 2026-07-10
depends_on: [provider]
satisfies_contracts:
  - from: provider
    function: resolveColumn
    when: always
    status: done
    verified_at: tests/core/good.test.ts:12
tags: [good]
path: Core / Good
---

Fixture: a fully valid doc that satisfies the provider's contract. Passes silently.
