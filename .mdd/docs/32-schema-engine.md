---
id: 32-schema-engine
title: Schema Engine
type: COMPONENT
path: Engine / Schema Engine
source_files: [src/engine/schema/loader.ts, src/engine/schema/validate.ts]
status: planned
phase: idle
last_synced: 2026-08-01
initiative: livestage
wave: livestage-wave-5
depends_on: [17-source-directives, 10-security-policy-core]
tags: [schema, frontmatter-classes, validation, doctor-integration, F-SCHEMA]
known_issues: []
satisfies_contracts:
  - from: 10-security-policy-core
    function: enforcePolicy
    when: always
    status: pending
    verified_at: ""
---

# Schema Engine

## What to Build

`[new; donor frontmatter-utils]`. Frontmatter document class declaration
under `.livestage/schemas/`, validated reads, and doctor integration
(schema files valid, feature 30's health check). This is F-SCHEMA, referenced
by `@read-frontmatter` (feature 17) and every projected read in F-FM-QUERY
(feature 36).

## Architecture

Every frontmatter read and write in the system routes through this
component's validation once a schema is declared for a document class:
`@read-frontmatter` (feature 17), `@update-frontmatter` (feature 33), and
`@list ... fields=` projections (feature 36).

## Implementation Notes

Config home: `.livestage/schemas/` (line 139). A schema declares a document
class's expected frontmatter shape (field names, types, allowed values);
"Schema validation (F-SCHEMA) applies to every projected read" (line 657,
in the fm-query business rules, but the validation logic itself lives here).

## Data Model

Schema file shape (illustrative, exact format settled during build): a JSON
or YAML document under `.livestage/schemas/<class>.json` declaring field
name -> type/constraint pairs for a document class.

## API/Interface

No direct directive; consumed by `@read-frontmatter`, `@update-frontmatter`,
and `@list ... fields=`. Surfaced via `doctor` (schema files valid check).

## Business Rules

1. Schema classes are declared under `.livestage/schemas/` (line 139,
   637-638).
2. Validated reads: a frontmatter read against a document with a declared
   schema class is checked against that schema.
3. `doctor` reports schema-file validity as part of its health check
   (line 534, feature 30).

## Acceptance Criteria

- [ ] A schema declares a project's doc class; `doctor` confirms it is valid.
- [ ] A frontmatter read against a document that violates its declared schema
      is flagged (exact surfacing, e.g. a `validate` failure or a read-time
      error, settled by feature 33/17's consuming behavior).
- [ ] An intentionally malformed schema file fails `doctor`'s schema-validity
      check.

## Dependencies

17-source-directives (schema-validated reads apply to `@read-frontmatter`),
10-security-policy-core (schema file reads are filesystem access subject to
policy).

## Known Issues

None.
