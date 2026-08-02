---
id: 25-cr7-suite-baseline
title: "CR-7: Suite Baseline"
type: SPEC
path: Contracts / Suite Baseline
source_files: []
test_files: [tests/unit/scripts/check-test-baseline.test.ts]
status: complete
phase: all
last_synced: 2026-08-02
initiative: livestage
wave: livestage-wave-3
depends_on: []
tags: [contract, test-baseline, ci-check, regression-floor, excluded-subsystems]
known_issues:
  - "RESOLVED (post-initiative known_issues sweep, 2026-08-02): built the missing automated baseline tool. vitest.config.ts now runs a second 'json' reporter alongside 'default', writing .vitest-results.json (gitignored) with an exact numTotalTests count on every run, so the count comes from the real suite run rather than a re-run or a manual tally. scripts/check-test-baseline.mjs compares that count against the floor recorded in scripts/test-baseline.json (checked in), exits 1 with a labeled diff on a drop, and only ever raises the floor (via an explicit --update flag, never on a plain check, and never below the current floor even with --update) so a deletion can't be laundered into the new baseline. Wired into CI as a step immediately after `npm test` (.github/workflows/ci.yml). Both directions verified live: a full run against the real 1147-test suite passes, and a deliberately shrunk run (29 tests) fails with exit 1 and the expected message; scripts/check-test-baseline.mjs also has its own test (test_files above) that spawns the real script against disposable fixture files for the pass, regression, --update, and missing-input cases."
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

The floor is a checked-in number (`scripts/test-baseline.json`), not a
recomputed one: `vitest.config.ts`'s `json` reporter writes the exact count
from the real run to `.vitest-results.json` (gitignored, regenerated every
`npm test`), and `scripts/check-test-baseline.mjs` reads both files and
compares. `npm run test:baseline` runs the check; `npm run test:baseline:update`
is the only path that ever raises the floor, and even it refuses to lower it
on a drop.

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

- [x] CI records the seeded test count as the baseline immediately after
      Wave 0, and every run compares against it. `scripts/test-baseline.json`
      holds the checked-in floor (currently 1154, with the full wave-by-wave
      history in its `note` field); `.github/workflows/ci.yml` runs
      `npm run test:baseline` right after `npm test` on every push and PR.
- [x] Every subsequent CI run's test count is >= baseline minus the
      enumerated exclusions: monotonically increasing every wave so far
      (714 -> 1154), never dropping.
- [x] A deliberately deleted, non-excluded test causes CI to fail the count
      check. Live-verified: running the suite scoped to a single 29-test
      file against the real 1147 floor produces exit 1 with
      "FAIL. Current test count 29 is below the recorded baseline 1147";
      the regression path also has its own automated test (see test_files).
- [x] A scan of the test suite finds no lifecycle helper harness, no
      protocol-level mock, and no test-only introspection hook: zero
      `vi.mock`/`jest.mock`/`sinon` usages found across `tests/`.

## Dependencies

None.

## Known Issues

See the frontmatter `known_issues` above: RESOLVED. The automated
baseline-diff tool (dual vitest reporters, `scripts/check-test-baseline.mjs`,
`scripts/test-baseline.json`, CI wiring) replaces the manual wave-closure-commit
tracking this doc originally described.
