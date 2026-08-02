---
id: 17-source-directives
title: Source Directives
type: COMPONENT
path: Directives / Sources
source_files: [src/parser/directives/list.ts, src/parser/directives/read.ts, src/parser/directives/read-frontmatter.ts, src/parser/directives/tree.ts, src/parser/directives/count.ts, src/parser/directives/date.ts, src/parser/directives/env.ts, src/engine/sources.ts, src/engine/read-ops.ts]
status: complete
phase: all
last_synced: 2026-08-02
initiative: livestage
wave: livestage-wave-2
depends_on: [09-grammar-parser, 11-extension-routing, 10-security-policy-core]
tags: [list, read, read-frontmatter, tree, count, date, env, filesystem-policy]
known_issues:
  - "source_files sources.ts and read-ops.ts are shared with feature 18 (Compute Directives): @query's engine implementation (executeQuery) lives in sources.ts, and @hash's (executeHash) lives in read-ops.ts, not in 18's own exec-ops.ts. The donor organized these engine modules by cohesion, not by strict per-directive file boundaries; corrected here and cross-referenced in 18's known_issues rather than moved."
satisfies_contracts:
  - from: 10-security-policy-core
    function: checkDataPath
    when: always
    status: done
    verified_at: "tests/unit/engine/source-data-root.test.ts::paths above data root are blocked (path traversal)"
  - from: 10-security-policy-core
    function: checkShellCommand
    when: always
    status: done
    verified_at: "tests/unit/engine/query-policy.test.ts::is blocked when the command is not in allow_patterns, even with allowShell true"
  - from: 10-security-policy-core
    function: checkWritePath
    when: "filesystem.write_enabled is true"
    status: done
    verified_at: "tests/unit/engine/source-directives-purity.test.ts::rendering every source directive leaves the directory snapshot unchanged"
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
| `@read` | `file`, `path=` (dot-notation, JSON/YAML/TOML), `column=`+`where=` (CSV), `key=` (.env) implemented but unreachable, see Known Issues), `label`, `as=` | raw file content, or a value/table extracted from structured files |
| `@read-frontmatter` | `path`, `field` (single, seeded) | schema-validated (F-SCHEMA); reads ONE top-level field per call, arrays comma-joined |
| `@tree` / `@count` | path/glob | tree render / count |
| `@date` / `@env` | format / `fallback` | now / env value; `@env` has no `masked` attribute. A resolved secret-shaped value is masked before it is written to cache (`cache.ts`) or a trace record (`engine.ts`'s `applyMasking` on directive args), never in the primary render/stdout output, which shows the value the caller explicitly requested |

## Business Rules

1. `@read`'s access option is expected to match the file format. RESOLVED
   (2026-08-02, post-initiative known_issues sweep): a mismatched option
   (e.g. `column=` against JSON, `path=` against CSV, any structured option
   against a plain file) now pushes a named warning identifying the option
   and the actual file kind, rather than silently falling through with no
   signal at all. Still not a hard error, matching this directive's
   established degrade-with-a-warning contract rather than a crash; the
   read itself still completes (raw content for a non-structured file, the
   correctly-typed structured read when the file DOES match one of the two
   supported kinds, just the extra option ignored). See Known Issues.
2. `@read-frontmatter`'s seeded form reads exactly one top-level field per
   call; arrays are comma-joined (line 335).
3. `@list`'s `where` filters structured rows only in the seed; frontmatter-
   aware `where` is not yet supported (deferred to feature 36) (line 333).
4. `@read`'s `key=` reads a named value from a `.env` file (`readEnvFile` in
   `sources.ts`), but `.env*`/`*.env` sits in the immutable
   `FILESYSTEM_ALWAYS_BLOCK_PATTERNS` list, so this path never actually
   executes; the sanctioned way to reach an env value is `@env NAME` backed
   by the CLI's `--env <file>` loader (feature 13), not a direct file read.
5. All filesystem access resolves through the security policy (feature 10),
   including path traversal checks.

## Acceptance Criteria

- [x] Each of `@list`, `@read`, `@read-frontmatter`, `@tree`, `@count`,
      `@date`, `@env` renders correctly against donor-copied fixture tests:
      `tests/unit/cli/cli-sources.test.ts` (14), `tests/unit/engine/source-
      data-root.test.ts` (17), `source-label-multiline.test.ts` (6), `read-
      frontmatter.test.ts` (8).
- [x] `@read` against a wrongly-matched access option (e.g. `column=` on a
      non-CSV file) warns, naming the option and the actual file kind,
      instead of silently falling through with no signal. Live-verified;
      tests/unit/cli/cli-sources.test.ts's three mismatch tests plus one
      proving a clean (no mismatched option) read against a plain file
      stays silent.
- [x] A `@list`/`@read`/`@query` call outside the granted filesystem/shell
      policy is blocked: `checkDataPath` via `source-data-root.test.ts`,
      `checkShellCommand` via `query-policy.test.ts`.
- [x] Secret-shaped values are masked before cache and trace persistence
      (never in the primary render output, which shows what the caller
      explicitly requested): `tests/unit/engine/trace.test.ts`'s masking
      block, `cache.ts`'s `applyMasking` call. The literal `@env key=...`
      acceptance criterion as worded does not apply: `@env` has no `key=`
      attribute (that belongs to `@read`), and `@read`'s `.env` path is
      unreachable, see Known Issues.

## Dependencies

09-grammar-parser, 11-extension-routing (resolution semantics),
10-security-policy-core (filesystem/env enforcement).

## Known Issues

- RESOLVED (2026-08-02): `@read`'s access options are now cross-validated
  against the file's actual format (`warnUnusedOption` in `sources.ts`);
  a mismatched option warns by name instead of silently falling through.
- `@read file.env key=...` (documented as reading `.env` files, masked) is
  implemented (`readEnvFile` in `sources.ts`) but unreachable: `.env*`/
  `*.env` sits in the immutable `FILESYSTEM_ALWAYS_BLOCK_PATTERNS` list, so
  the always-block rule refuses the read before masking ever applies. The
  sanctioned way to read an env value is `@env NAME`, backed by the CLI's
  `--env <file>` loader, not a direct file read of an arbitrary `.env`.
- Discovered while proving the `checkWritePath` contract: rendering with no
  explicit trace config creates `.livestage/trace/` on disk by default
  (Wave 1's render-trace default-on change). This is read as spec-sanctioned
  ("the only cross-invocation artifact," spec line 45), not a CR-10
  violation, and `tests/unit/engine/source-directives-purity.test.ts`
  excludes it explicitly on that basis; flagged here since CR-10's literal
  wording ("zero filesystem mutations") does not itself carve out the
  trace, and feature 42 (Contract Scans) should confirm this reading when
  it builds the real purity harness.
- `sources.ts` and `read-ops.ts` are shared with feature 18 (Compute
  Directives): `@query`'s engine implementation lives here, and `@hash`'s
  is in `read-ops.ts`, not in 18's `exec-ops.ts`.
