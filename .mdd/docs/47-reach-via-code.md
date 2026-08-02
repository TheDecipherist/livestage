---
id: 47-reach-via-code
title: Reach Via Code
type: COMPONENT
path: Examples / Reach Via Code
source_files: [examples/database/customers.stage, examples/database/query-enterprise.js,
  examples/database/customers.json, examples/database/.livestage/policy.json,
  examples/http-health/check.stage, examples/http-health/check-health.js,
  examples/http-health/.livestage/policy.json]
test_files: [tests/e2e/reach-via-code.test.ts]
status: complete
phase: all
last_synced: 2026-08-02
initiative: livestage
wave: livestage-wave-6
depends_on: [29-code-runners]
tags: [reach-via-code, database-example, http-example, policy-grants, user-guide-link]
known_issues:
  - "The database example uses a JSON file (customers.json) read via
    node:fs as the driver, not a real database connection: no database
    server is available in this build/CI environment, and adding a real
    driver dependency (pg, mysql2, better-sqlite3) just for a worked
    example would add a runtime dependency to a project whose bundle
    (feature 41) explicitly carries none. The doc's own prose says exactly
    this: swap the JSON read for a real driver and nothing else changes,
    same @code block, same @render type=table on the other end."
  - "The HTTP example's fetch target is a local server the script starts
    and tears down within its own execution (http.createServer on an
    ephemeral port), not an external service: this sandbox has no outbound
    network access (verified live, a real fetch to an external host fails
    immediately), and a worked example that only runs when the internet
    happens to be reachable is a worse teaching tool than one that always
    runs. The script comments make clear this is example scaffolding, not
    the pattern itself; a real version points fetch at an external URL."
  - "The Data Model section's original phrasing (\"driver script emits JSON
    { [label]: <rows> }, rendered via {{ label }} + @render table\")
    describes a rendering path that does not exist: @render's table format
    only ever reads tab-separated lines from a PIPE (RendererInput.data),
    there is no mechanism that turns a {{ label }}-captured struct into
    table rows directly. The database example instead pipes @code (self-
    closed, src=) into @render type=\"table\", the same tab-separated-stdout
    convention @query/@list already use; the HTTP example (a single
    struct, not tabular rows) does use {{ label.field }} dot-access for its
    plain bullet-list summary, which IS a supported path."
  - "RESOLVED (2026-08-02, post-initiative known_issues sweep): @code now
    supports visible=/silent=, the same convention every source directive
    already had (feature 29's known_issues has the implementation). This
    example's check.stage now passes visible=\"false\" on its @code call,
    so the raw JSON line no longer duplicates the {{ label.field }} bullet
    summary below it; live-verified, tests/e2e/reach-via-code.test.ts still
    passes unchanged since it only asserted on the summary fields."
  - "Directory names (examples/database/, examples/http-health/) match the
    spec's own inferred defaults exactly, confirmed during this wave's
    build; no rename was needed."
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

- Database example: driver script emits tab-separated rows (header +
  data), piped `@code src=... | @render type="table"`, the same convention
  `@query`/`@list` already use for tabular output. See known_issues for why
  this replaced the originally-planned `{{ label }}` + `@render table` path
  (that path doesn't exist).
- HTTP example: `fetch` script emits structured status JSON
  (`{ status: number, ok: boolean, latency_ms: number }`), captured via
  `label=` and read with `{{ label.field }}` dot-access.

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

- [x] The database example renders a table from driver output, using only a
      granted `@code` language, no direct database directive. Live-verified;
      tests/e2e/reach-via-code.test.ts::"renders a table of enterprise-plan
      customers...".
- [x] The HTTP example renders structured health-check status, using only a
      granted `@code` language, no direct HTTP directive. Live-verified;
      tests/e2e/reach-via-code.test.ts::"renders a successful health
      check...".
- [x] Each example's required `.livestage/policy.json` grant is documented
      alongside it and is sufficient (and minimal) to make the example run.
      Both grant only `code.languages: ["javascript"]`, no shell/filesystem
      write; tests/e2e/reach-via-code.test.ts::"both examples ship the
      exact policy grant they need".
- [x] Both examples are referenced from the user guide (feature 45).
      docs/user-guide.md's "Reference examples" section links both;
      tests/e2e/user-guide.test.ts::"covers every retired directive
      class..." asserts both paths are present.

## Dependencies

29-code-runners (both examples are `@code` scripts under policy).

## Known Issues

The exact directory names for these two examples are inferred rather than
fixed by the spec; confirm and update `source_files` during Wave 6 build.
