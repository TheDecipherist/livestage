---
id: 30-doctor
title: Doctor
type: COMPONENT
path: CLI / Doctor
source_files: [src/cli/commands/doctor.ts]
status: planned
phase: idle
last_synced: 2026-08-01
initiative: livestage
wave: livestage-wave-4
depends_on: [10-security-policy-core, 12-render-trace, 29-code-runners, 27-assert-liveness]
tags: [doctor, health-check, json-output, rules-for, coverage]
known_issues: []
satisfies_contracts:
  - from: 10-security-policy-core
    function: enforcePolicy
    when: always
    status: pending
    verified_at: ""
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

- [ ] `doctor` on a healthy fixture project prints exactly one line.
- [ ] `doctor --json` output validates against its own schema.
- [ ] `doctor --rules-for <file>` against a fixture correctly lists matching
      assertion documents, their pass state, and a coverage figure.
- [ ] `doctor` correctly reports a named failure (e.g. an unparseable
      `.stage` file, a missing hook registration) with a non-zero exit.

## Dependencies

10-security-policy-core (per-surface grant state), 12-render-trace (trace
path check), 29-code-runners (granted-language reporting), 27-assert-
liveness (assertion-liveness summary).

## Known Issues

None.
