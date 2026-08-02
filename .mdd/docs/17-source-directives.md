---
id: 17-source-directives
title: Source Directives
type: COMPONENT
path: Directives / Sources
source_files: [src/parser/directives/list.ts, src/parser/directives/read.ts, src/parser/directives/read-frontmatter.ts, src/parser/directives/tree.ts, src/parser/directives/count.ts, src/parser/directives/date.ts, src/parser/directives/env.ts, src/engine/sources.ts, src/engine/read-ops.ts]
status: planned
phase: idle
last_synced: 2026-08-01
initiative: livestage
wave: livestage-wave-2
depends_on: [09-grammar-parser, 11-extension-routing, 10-security-policy-core]
tags: [list, read, read-frontmatter, tree, count, date, env, filesystem-policy]
known_issues: []
satisfies_contracts:
  - from: 10-security-policy-core
    function: enforcePolicy
    when: always
    status: pending
    verified_at: ""
---

# Source Directives

## What to Build

`[verify]`, copy from
`~/projects/markdownai/packages/parser/src/directives/*` and
`packages/engine/src/*`. `@list`, `@read`, `@read-frontmatter`, `@tree`,
`@count`, `@date`, `@env`: the directives that pull raw data from the
filesystem, structured files, and the environment.

## Architecture

Every filesystem or env access these directives make must resolve through
feature 10's `enforcePolicy` gate (declared as an `integration_contracts`
provider there); this component is a `satisfies_contracts` dependent.

## Implementation Notes

`@list`'s `where` filters STRUCTURED rows only in the seed; frontmatter-aware
`where` and `fields=` projection over document globs is F-FM-QUERY, deferred
to feature 36 (Wave 5). `@read-frontmatter`'s seeded form reads ONE top-level
field per call, arrays comma-joined; multi-field struct capture
(`label=doc` -> `{{ doc.status }}`) is also F-FM-QUERY.

## Data Model

N/A (each directive's output shape is the raw/structured data it reads;
schema validation of frontmatter reads is owned by feature 32).

## API/Interface

| Directive | Key attrs | Behavior |
|---|---|---|
| `@list` | glob/`match`/`type`/`depth` (filesystem), `path`/`mode` (JSON), `columns`+`where` (structured rows), `label`, `as=` | files, dirs, JSON array/object items, CSV rows |
| `@read` | `file`, `path=` (dot-notation, JSON/YAML/TOML), `column=`+`where=` (CSV), `key=` (.env, masked), `label`, `as=` | raw file content, or a value/table extracted from structured files; wrong access option for the format is a parse error |
| `@read-frontmatter` | `path`, `field` (single, seeded) | schema-validated (F-SCHEMA); reads ONE top-level field per call, arrays comma-joined |
| `@tree` / `@count` | path/glob | tree render / count |
| `@date` / `@env` | format / `masked`, `fallback` | now / env value |

## Business Rules

1. `@read`'s access option must match the file format, or it is a parse
   error (line 334).
2. `@read-frontmatter`'s seeded form reads exactly one top-level field per
   call; arrays are comma-joined (line 335).
3. `@list`'s `where` filters structured rows only in the seed; frontmatter-
   aware `where` is not yet supported (deferred to feature 36) (line 333).
4. `@env`'s `key=` reads from `.env` and is masked (line 337).
5. All filesystem access resolves through the security policy (feature 10),
   including path traversal checks.

## Acceptance Criteria

- [ ] Each of `@list`, `@read`, `@read-frontmatter`, `@tree`, `@count`,
      `@date`, `@env` renders correctly against donor-copied fixture tests.
- [ ] `@read` against a wrongly-matched access option (e.g. `column=` on a
      non-CSV file) produces a parse error, not silent misbehavior.
- [ ] A `@list`/`@read`/`@env` call outside the granted filesystem policy is
      blocked (satisfies the `enforcePolicy` contract from feature 10).
- [ ] `@env key=...` output is masked in render, cache, and trace.

## Dependencies

09-grammar-parser, 11-extension-routing (resolution semantics),
10-security-policy-core (filesystem/env enforcement).

## Known Issues

None.
