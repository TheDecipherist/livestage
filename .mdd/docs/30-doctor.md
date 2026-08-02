---
id: 30-doctor
title: Doctor
type: COMPONENT
path: CLI / Doctor
source_files: [src/cli/commands/doctor.ts]
status: complete
phase: all
last_synced: 2026-08-02
initiative: livestage
wave: livestage-wave-4
depends_on: [10-security-policy-core, 12-render-trace, 29-code-runners, 27-assert-liveness]
tags: [doctor, health-check, json-output, rules-for, coverage]
known_issues:
  - "doctor never existed (not registered in cli.ts) and depended on feature 31's hook registration format to check hooks, so it was built after init's real rewrite, not before. --rules-for actually executes each matching document's assertions (via feature 28's runAssert) to report real pass state, not a structural listing with a hardcoded guess."
  - "RESOLVED (2026-08-02): the schemas check was a placeholder when this doc last synced (feature 32, Schema Engine, did not exist yet in wave 4). Feature 32 landed in wave 5 and checkSchemas was rewritten to a real check (src/cli/commands/doctor.ts::checkSchemas, using listSchemaFiles) at that time, but this doc's own known_issues was never revisited to say so, a concrete instance of the 'downstream landed, nobody swept the upstream stub' pattern in the post-initiative known_issues retrospective. checkSchemas now reports 'no schema files declared', a valid count, or the invalid files by name and parse error; covered by tests/unit/cli/doctor.test.ts::'fails an intentionally malformed schema file'."
  - "checkDocsParse deliberately checks parse() only, not full validate()-level semantics (undefined macros, missing includes, etc.), matching business rule 1's literal wording ('every project .stage parses'). A document with e.g. an undefined @call macro is NOT flagged unhealthy by doctor; run validate for that."
satisfies_contracts:
  - from: 10-security-policy-core
    function: checkDataPath
    when: always
    status: done
    verified_at: "tests/unit/cli/doctor.test.ts::checks a nested project structure, not just the top level"
  - from: 10-security-policy-core
    function: checkShellCommand
    when: always
    status: done
    verified_at: "src/cli/commands/doctor.ts:57"
  - from: 10-security-policy-core
    function: checkWritePath
    when: "filesystem.write_enabled is true"
    status: done
    verified_at: "src/cli/commands/doctor.ts:120"
---

# Doctor

## What to Build

`[new; donor init checks as probes]`. `livestage doctor [--json] [--rules-for
<file>]`: binary version, hooks registered + executable, every project
`.stage` parses, policy loads with per-surface grant state, trace path
writable, assertion-liveness summary, schema files valid. One line when
healthy; `--json` emits machine-readable health with no blessed consumer;
`--rules-for <file>` lists the assertion documents whose targets match the
file and their pass state, plus coverage.

## Architecture

Reads state from feature 10 (policy grant state), feature 12 (trace path),
feature 29 (granted code languages), and feature 27 (assertion liveness
summary) without owning any of their logic itself; doctor is a read-only
aggregator.

## Implementation Notes

Donor `init` idempotence checks are lifted as probes (line 168, 625). "No
blessed consumer exists" (Principle 10, line 121-122) applies directly to
`--json` output: doctor does not assume a specific CI tool reads it.

## Data Model

`--json` health object (illustrative shape, exact fields settled during
build): `{ healthy: boolean, version: string, hooks: {...}, docsParsed:
{...}, policy: {...}, trace: {...}, assertions: {...}, schemas: {...} }`.

## API/Interface

`livestage doctor [--json] [--rules-for <file>]` (line 523, 532-537).

## Business Rules

1. Checks: binary version, hooks registered + executable, every project
   `.stage` parses, policy loads with per-surface grant state, trace path
   writable, assertion-liveness summary, schema files valid (line 532-534).
2. One line when healthy (line 534).
3. `--json` emits machine-readable health; no blessed consumer (line
   534-535).
4. `--rules-for <file>` lists the assertion documents whose targets match the
   file and their pass state, plus coverage (line 535-537).

## Acceptance Criteria

- [x] `doctor` on a healthy fixture project prints exactly one line.
      Live-verified and `tests/unit/cli/doctor.test.ts`.
- [!] `doctor --json` output has a stable, typed shape (`DoctorHealth`) and
      is live-verified to be valid JSON, but there is no formal JSON Schema
      to validate it against; none is specified anywhere in the doc corpus
      to build one from ("no blessed consumer," Principle 10, cuts against
      inventing one unprompted).
- [x] `doctor --rules-for <file>` against a fixture correctly lists matching
      assertion documents, their pass state (actually executed, not
      guessed), and a coverage figure. Live-verified and tested.
- [x] `doctor` correctly reports a named failure (an unparseable `.stage`
      file, a missing hook registration) with a non-zero exit. Live-
      verified and tested for both cases.

## Dependencies

10-security-policy-core (per-surface grant state), 12-render-trace (trace
path check), 29-code-runners (granted-language reporting), 27-assert-
liveness (assertion-liveness summary).

## Known Issues

See the frontmatter `known_issues` above: the schemas check placeholder is
now resolved, `checkDocsParse`'s scope being parse-only (not full
`validate()` semantics) remains a deliberate, documented limitation.
