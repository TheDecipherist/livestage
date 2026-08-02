---
id: 25-cr7-suite-baseline
title: "CR-7: Suite Baseline"
type: SPEC
path: Contracts / Suite Baseline
source_files: []
status: complete
phase: all
last_synced: 2026-08-02
initiative: livestage
wave: livestage-wave-3
depends_on: []
tags: [contract, test-baseline, ci-check, regression-floor, excluded-subsystems]
known_issues:
  - "No dedicated baseline-recording/CI-diff tool exists (no script writes a stored count and compares it on each run); this SPEC's numeric-floor mechanism is tracked manually via each wave-closure commit message and .startup.md's append-only log instead, which record the test count at every wave boundary (714 seed -> 723 -> 738 -> 790 -> 814 -> 832 -> 848 through wave 3, monotonically increasing, never dropping). A real automated CI gate for this belongs with feature 42 (Contract Scans, wave 6) if built at all; noting the gap here rather than building one-off tooling for it now."
  - "Business rule 3 (no lifecycle helpers, no protocol mocks, no test-only introspection) verified by scan: zero uses of vi.mock/jest.mock/sinon anywhere in tests/. Tests spawn the real built CLI binary, use real tmpdir filesystem operations, and call library functions directly, never a protocol-level double."
---

# CR-7: Suite Baseline

## What to Build

A behavior contract: the merged suite is green; test count never falls below
the seeded baseline minus the enumerated excluded-subsystem tests.

## Architecture

The baseline is established at seed time (feature 01, Wave 0 step 4: "enumerate
retired excluded-subsystem tests," line 203-207) and checked continuously
through every subsequent wave, hence its placement here in Wave 3 where
verification tooling first exists to make "green" a checked CI fact rather
than an assertion.

## Implementation Notes

The excluded-subsystem test list (the CR-7 baseline) explicitly includes the
MCP suites, the five `e2e/run-state-*.test.ts` suites (they test the removed
cross-call session state), and the AI-consumer format suites (line 205-207).
Any test count drop beyond this enumerated list is a regression, not an
accepted baseline shift.

## Data Model

N/A. The baseline is a number (or a named test-id set) recorded at seed time
and compared against on every CI run.

## API/Interface

N/A. Checked by CI (`npm test` plus a count comparison), not by a directive
or CLI verb.

## Business Rules

1. Merged suite is green (line 739-740).
2. Test count never falls below the seeded baseline minus the enumerated
   excluded-subsystem tests (line 740).
3. The suite carries no lifecycle helpers, no protocol mocks, and no
   test-only introspection: tests exercise the same CLI verbs and artifacts
   (stdout, exit codes, trace records) that production consumers read, not a
   parallel test-only surface (Testing Strategy, line 771-772).

## Acceptance Criteria

- [!] CI records the seeded test count as the baseline immediately after
      Wave 0. Recorded manually in commit messages and `.startup.md`
      instead of an automated tool; see Known Issues.
- [x] Every subsequent CI run's test count is >= baseline minus the
      enumerated exclusions: monotonically increasing every wave so far
      (714 -> 848), never dropping.
- [ ] A deliberately deleted, non-excluded test causes CI to fail the count
      check. Not provable: no automated count-diff tool exists to fail.
- [x] A scan of the test suite finds no lifecycle helper harness, no
      protocol-level mock, and no test-only introspection hook: zero
      `vi.mock`/`jest.mock`/`sinon` usages found across `tests/`.

## Dependencies

None.

## Known Issues

See the frontmatter `known_issues` above: no automated baseline-diff tool
exists yet; tracked manually through wave-closure commits and
`.startup.md` instead.
