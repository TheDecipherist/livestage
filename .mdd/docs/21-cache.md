---
id: 21-cache
title: Cache
type: COMPONENT
path: Engine / Cache
source_files: [src/engine/cache.ts]
status: planned
phase: idle
last_synced: 2026-08-01
initiative: livestage
wave: livestage-wave-2
depends_on: [10-security-policy-core]
tags: [cache, livestage-cache-dir, mock-fixtures, hook-render-cache]
known_issues: []
satisfies_contracts:
  - from: 10-security-policy-core
    function: enforcePolicy
    when: always
    status: pending
    verified_at: ""
---

# Cache

## What to Build

`[verify]`, copy from
`~/projects/markdownai/packages/engine/src/*` (cache subsystem). Renders and
directive results are cached under `.livestage/cache/`; this is also where
the hook writes its rendered substitution output. Deterministic mode's
`@cache mock=fixture.json` serves fixtures for `@query`/`@code`, owned
functionally by feature 35 (Determinism) but the underlying cache read/write
path is this component.

## Architecture

Consumed directly by feature 11 (Extension Routing) for hook-render caching,
and by feature 35 (Determinism) for mock-fixture serving.

## Implementation Notes

Cache home is `.livestage/cache/` under the project's `.livestage/` config
directory (line 138-140).

## Data Model

Cache entry: keyed by a content/render-input hash, storing the resolved
markdown (for hook renders) or a directive's structured result (for mock
fixtures).

## API/Interface

`livestage cache clear|status` (line 527).

## Business Rules

1. Cache lives under `.livestage/cache/` (line 139).
2. Cache entries are masked before write (shared rule with feature 10's
   masking requirement, line 435).
3. In deterministic mode, `@cache mock=fixture.json` serves a fixture instead
   of executing `@query`/`@code` live (line 545).

## Acceptance Criteria

- [ ] `cache status` reports current cache state (entry count / size);
      `cache clear` empties `.livestage/cache/`.
- [ ] A hook render writes its output to `.livestage/cache/` and a
      subsequent identical read serves consistently.
- [ ] `@cache mock=fixture.json` correctly substitutes fixture data for a
      `@query`/`@code` call under `--deterministic`.

## Dependencies

10-security-policy-core (cache writes are subject to masking).

## Known Issues

None.
