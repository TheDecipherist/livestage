---
id: 42-contract-scans
title: Contract Scans
type: COMPONENT
path: Contracts / Contract Scans
source_files: [tests/purity/, tests/security-matrix/, tests/golden/]
status: planned
phase: idle
last_synced: 2026-08-01
initiative: livestage
wave: livestage-wave-6
depends_on: [02-cr1-standalone-identity, 03-cr2-one-package, 04-cr3-stage-only, 05-cr4-no-daemon-no-memory, 06-cr5-deny-by-default, 14-cr6-fallback-totality, 15-cr10-render-purity, 16-cr11-markdown-out, 25-cr7-suite-baseline, 37-cr8-bare-checkout, 38-cr9-doc-corpus-integrity, 39-cr-d7-reuse-fidelity]
tags: [contract-scans, identity-grep, purity-harness, registry-tests, ci-suite]
known_issues: []
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

- [ ] `npm test` runs all twelve scans/tests/harnesses and every one is
      green on the completed build (Wave 6 demo-state: "every CR scan and
      suite green," line 671).
- [ ] Each scan/test/harness's specific acceptance criteria (listed on its
      owning SPEC doc) pass when run individually, not only as part of the
      full suite.

## Dependencies

02-cr1-standalone-identity, 03-cr2-one-package, 04-cr3-stage-only,
05-cr4-no-daemon-no-memory, 06-cr5-deny-by-default, 14-cr6-fallback-totality,
15-cr10-render-purity, 16-cr11-markdown-out, 25-cr7-suite-baseline,
37-cr8-bare-checkout, 38-cr9-doc-corpus-integrity, 39-cr-d7-reuse-fidelity.

## Known Issues

None.
