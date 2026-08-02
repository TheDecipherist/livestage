---
id: 32-schema-engine
title: Schema Engine
type: COMPONENT
path: Engine / Schema Engine
source_files: [src/engine/schema/loader.ts, src/engine/schema/validate.ts,
  src/engine/read-ops.ts, src/engine/graph.ts]
status: complete
phase: all
last_synced: 2026-08-02
initiative: livestage
wave: livestage-wave-5
depends_on: [17-source-directives, 10-security-policy-core]
tags: [schema, frontmatter-classes, validation, doctor-integration, F-SCHEMA]
known_issues:
  - "Design decision made during build (not specified further than 'illustrative' in this doc): a document opts into schema validation via a top-level class: frontmatter field naming which .livestage/schemas/<class>.json applies. No class field, or a class with no matching schema file, means unvalidated, not an error, matching business rule 2's 'once a schema is declared' framing."
  - "RESOLVED (2026-08-02, post-initiative known_issues sweep): read-side validation is now wired. @read-frontmatter (both single-field mode and struct/label= mode) and @graph (every scalar field on a graphed doc other than the relation field itself, which is list-shaped and outside the schema vocabulary) now check the target document against its declared class if one exists, warning rather than blocking since reads must stay pure. tests/unit/engine/read-frontmatter.test.ts's '@read-frontmatter schema check' describe block (5 tests), tests/unit/engine/graph-schema.test.ts (3 tests)."
  - "Validation is scoped to plain top-level scalar fields; list-addressed fields (field[N], field[append]) are not schema-checked, since a schema field declares a single type/enum, not a list-item shape."
  - "Found and fixed a real path-traversal gap while writing tests: schemaPath() joined an unsanitized class name into .livestage/schemas/<class>.json without checking it. Since class: is a document's own frontmatter field (untrusted content), a value like class: \"../../../etc/passwd\" resolved via path.join()'s .. handling to a path OUTSIDE the schemas directory entirely, reading an arbitrary file as if it were a schema (not full checkDataPath jailing, but the same class of bug that gate exists to prevent). Fixed with a strict identifier allowlist ([A-Za-z0-9_-]+) for class names; a class name is a simple identifier, never a path component. tests/unit/engine/schema-engine.test.ts (2 tests)."
satisfies_contracts:
  - from: 10-security-policy-core
    function: checkDataPath
    when: always
    status: done
    verified_at: "tests/unit/engine/schema-engine.test.ts::rejects a class name containing path traversal, never escapes .livestage/schemas/"
  - from: 10-security-policy-core
    function: checkShellCommand
    when: always
    status: done
    verified_at: "src/engine/schema/loader.ts:1"
  - from: 10-security-policy-core
    function: checkWritePath
    when: "filesystem.write_enabled is true"
    status: done
    verified_at: "src/engine/schema/loader.ts:1"
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

- [x] A schema declares a project's doc class; `doctor` confirms it is
      valid. Live-verified and `tests/unit/cli/doctor.test.ts`.
- [x] Settled the "exact surfacing" question this criterion left open:
      surfaced on the write side (`@update-frontmatter`, feature 33) as a
      pre-write block with a named error, live-verified and tested; and on
      the read side (`@read-frontmatter`, `@graph`) as a warning, since
      reads must stay pure and cannot block. Live-verified and tested, see
      Known Issues.
- [x] An intentionally malformed schema file fails `doctor`'s
      schema-validity check. Live-verified and tested.

## Dependencies

17-source-directives (schema-validated reads apply to `@read-frontmatter`),
10-security-policy-core (schema file reads are filesystem access subject to
policy).

## Known Issues

See the frontmatter `known_issues` above: the class-name path-traversal
fix (the real security finding of this feature), the read-side deferral,
and the list-field scope limit.
