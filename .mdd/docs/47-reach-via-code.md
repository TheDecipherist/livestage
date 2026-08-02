---
id: 47-reach-via-code
title: Reach Via Code
type: COMPONENT
path: Examples / Reach Via Code
source_files: [examples/database/, examples/http-health/]
status: planned
phase: idle
last_synced: 2026-08-01
initiative: livestage
wave: livestage-wave-6
depends_on: [29-code-runners]
tags: [reach-via-code, database-example, http-example, policy-grants, user-guide-link]
known_issues: []
---

# Reach Via Code

## What to Build

`[new]`. Two worked examples under `examples/` proving external reach is
`@code` under policy, not a directive tier: a database-backed doc (driver
code in a `@code` script, JSON out, `{{ label }}` + `@render table` in the
doc) and an HTTP health-check doc (`fetch` in a `@code` script, structured
status out). Both accompanied by the policy grants they need, both linked
from the user guide (feature 45) as the canonical reach patterns. Exact
directory names (`examples/database/`, `examples/http-health/`) are inferred;
the spec names the two examples by function, not by path.

## Architecture

"There is no Wave 7. External reach (databases, HTTP, anything beyond the
filesystem and the allowlisted shell) is not a directive tier; it is `@code`
under policy" (line 698-700). This is the concrete proof of that architectural
line: the retired `@db`/`@http` directives (excluded at seed) are replaced by
these two worked examples, not by new directives.

## Implementation Notes

Each example ships alongside the exact `.livestage/policy.json` grant it
needs (e.g. `code.languages` including the driver's language, plus any
required `code.runners` entry), so a reader can copy both the script and the
grant together rather than guessing at the policy shape.

## Data Model

- Database example: driver script emits JSON `{ [label]: <rows> }`, rendered
  via `{{ label }}` + `@render table`.
- HTTP example: `fetch` script emits structured status JSON (e.g.
  `{ status: number, ok: boolean, latency_ms: number }`).

## API/Interface

N/A new directive; both examples are `.stage` documents using `@code` plus
existing render formats (feature 20).

## Business Rules

1. Database example: driver code lives entirely inside the `@code` script;
   the `.stage` doc only receives JSON out and renders it (line 691-693).
2. HTTP example: `fetch` lives entirely inside the `@code` script; the doc
   receives structured status out (line 693-694).
3. Both examples are accompanied by their required policy grants, shown
   explicitly (line 694-695).
4. Both are linked from the user guide as the canonical reach patterns
   (line 695, shared with feature 45).

## Acceptance Criteria

- [ ] The database example renders a table from driver output, using only a
      granted `@code` language, no direct database directive.
- [ ] The HTTP example renders structured health-check status, using only a
      granted `@code` language, no direct HTTP directive.
- [ ] Each example's required `.livestage/policy.json` grant is documented
      alongside it and is sufficient (and minimal) to make the example run.
- [ ] Both examples are referenced from the user guide (feature 45).

## Dependencies

29-code-runners (both examples are `@code` scripts under policy).

## Known Issues

The exact directory names for these two examples are inferred rather than
fixed by the spec; confirm and update `source_files` during Wave 6 build.
