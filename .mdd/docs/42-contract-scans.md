---
id: 42-contract-scans
title: Contract Scans
type: COMPONENT
path: Contracts / Contract Scans
source_files: [tests/purity/render-purity.test.ts, tests/golden/markdown-out.test.ts,
  tests/contracts/doc-corpus.test.ts, tests/contracts/reuse-fidelity.test.ts,
  tests/e2e/bare-checkout.test.ts]
status: complete
phase: all
last_synced: 2026-08-02
initiative: livestage
wave: livestage-wave-6
depends_on: [02-cr1-standalone-identity, 03-cr2-one-package, 04-cr3-stage-only, 05-cr4-no-daemon-no-memory, 06-cr5-deny-by-default, 14-cr6-fallback-totality, 15-cr10-render-purity, 16-cr11-markdown-out, 25-cr7-suite-baseline, 37-cr8-bare-checkout, 38-cr9-doc-corpus-integrity, 39-cr-d7-reuse-fidelity]
tags: [contract-scans, identity-grep, purity-harness, registry-tests, ci-suite]
known_issues:
  - "The doc's original source_files hint (tests/purity/, tests/security-matrix/,
    tests/golden/) assumed all twelve scans still needed building fresh.
    Nine of twelve already existed and were already wired into npm test
    from earlier waves: CR-1/CR-2/CR-3/CR-4 (grep/scan-based, verified live
    in wave 1), CR-5 (tests/unit/engine/allowed.test.ts,
    security-filesystem.test.ts, template-security.test.ts, no separate
    tests/security-matrix/ directory), CR-6 (fallback-registry.test.ts),
    CR-7 (the no-mocks scan plus manually-tracked baseline, see 25's own
    known_issues), CR-8 (this wave's new tests/e2e/bare-checkout.test.ts).
    This component's actual new work was the three that were genuinely
    unbuilt: CR-9 (tests/contracts/doc-corpus.test.ts), CR-10
    (tests/purity/render-purity.test.ts, the corpus-wide harness CR-10's
    own known_issues had flagged as feature 42's job), CR-11
    (tests/golden/markdown-out.test.ts), plus CR-D7
    (tests/contracts/reuse-fidelity.test.ts)."
  - "Building the CR-11 and CR-D7 scans found real, independent bugs outside
    this component's own scope, fixed in place rather than worked around:
    CR-11's registry-iterating render surfaced that @update-frontmatter's
    value= and @assert's equals= never interpolated {{ }} expressions
    (fixed in write-ops.ts and assert/operators.ts, feature 40's known_issues
    has the full story); CR-D7's scan found 22-pipe.md (wave 2) had never
    actually cited its donor source despite real fix history, fixed in the
    doc itself (feature 39's known_issues)."
---

# Contract Scans

## What to Build

`[new]`. The full CR scan suite that runs on every `npm test`: the identity
grep (CR-1), the stage-only hook matrix (CR-3), the no-daemon scan (CR-4),
the markdown-out registry test (CR-11), the fallback-total registry test
(CR-6), and the purity harness (CR-10). This is the single suite that turns
all twelve cross-cutting contracts from prose into checked, automated gates.

## Architecture

Each SPEC (features 02-06, 14-16, 25, 37-39) declares WHAT must be true; this
component is the WHERE it is actually checked. It does not re-derive the
rules, it implements the scans/tests/harnesses those SPEC docs already
specify in full.

## Implementation Notes

"Twelve contracts, each enforced by a scan, a registry-iterating test, or a
harness, verified on every `npm test`" (line 708-709). This component is
deliberately thin on its own business rules; the substance lives in the
twelve SPEC docs it depends on. Its job is wiring, not judgment.

The suite this component runs inside carries the same testing-strategy
constraint as CR-7 (feature 25): no lifecycle helpers, no protocol mocks, no
test-only introspection (line 771-772). A scan/harness that itself needs a
parallel test-only code path to run would violate the contract it is meant
to check.

## Data Model

N/A.

## API/Interface

Runs as part of `npm test`; no separate CLI verb (contrast with `doctor`,
feature 30, which is a runtime health check, not a build-time contract
scan).

## Business Rules

Each rule below is owned in full by its SPEC doc; this component implements
the checking mechanism only.

1. CR-1 identity grep (feature 02).
2. CR-2 one-package scan (feature 03).
3. CR-3 stage-only scan plus hook test matrix (feature 04).
4. CR-4 no-daemon-no-memory scan (feature 05).
5. CR-5 deny-by-default security matrix (feature 06).
6. CR-6 fallback-totality registry test (feature 14).
7. CR-7 suite-baseline CI check (feature 25).
8. CR-8 bare-checkout e2e (feature 37).
9. CR-9 doc-corpus-integrity scan plus wave gate (feature 38).
10. CR-10 render-purity harness (feature 15).
11. CR-11 markdown-out registry test (feature 16).
12. CR-D7 reuse-fidelity wave review gate (feature 39).

## Acceptance Criteria

- [x] `npm test` runs all twelve scans/tests/harnesses and every one is
      green on the completed build (Wave 6 demo-state: "every CR scan and
      suite green," line 671). Live-verified: full `npm test` green
      (1105 tests, 76 files) after wiring the four newly-built scans in.
- [x] Each scan/test/harness's specific acceptance criteria (listed on its
      owning SPEC doc) pass when run individually, not only as part of the
      full suite. Each of the four new scan files run standalone via
      `npx vitest run <file>` during development, independent of the rest
      of the suite.

## Dependencies

02-cr1-standalone-identity, 03-cr2-one-package, 04-cr3-stage-only,
05-cr4-no-daemon-no-memory, 06-cr5-deny-by-default, 14-cr6-fallback-totality,
15-cr10-render-purity, 16-cr11-markdown-out, 25-cr7-suite-baseline,
37-cr8-bare-checkout, 38-cr9-doc-corpus-integrity, 39-cr-d7-reuse-fidelity.

## Known Issues

None.
