---
id: 02-cr1-standalone-identity
title: "CR-1: Standalone Identity"
type: SPEC
path: Contracts / Standalone Identity
source_files: []
status: complete
phase: all
last_synced: 2026-08-01
initiative: livestage
wave: livestage-wave-1
depends_on: []
tags: [contract, identity, rebrand, ci-scan, donor-isolation]
known_issues:
  - "RESOLVED in wave 4 (feature 31, Init): src/cli/commands/init.ts and src/cli/templates/claude-section.ts no longer carry donor identity strings. The scan is now zero hits across src/ and dist/ with no exceptions. This closure also fixed a real bug the donor identity strings were masking: init.ts's PreToolUse hook registration installed a completely different, wrong hook (donor content-sniffing of .md files) that had nothing to do with the actual hook this project built (src/hook/pretooluse.ts, feature 11); see 31-init.md's known_issues for the full finding."
---

# CR-1: Standalone Identity

## What to Build

A behavior contract, not code: zero occurrences of donor brand strings, former
package scopes, or former binary names in `src/`, `dist/`, shipped docs, CLI
output, or error messages. Case-insensitive. Verified by a scan that every
COMPONENT satisfying this contract must pass on every `npm test`.

## Architecture

Sits under every wave-1 COMPONENT (feature 07 pkg-skeleton through 13
cli-router) and is re-verified at the end by feature 42 (Contract Scans). This
spec exists so the seed script's rename step (feature 01) has a checkable
success condition instead of "looks renamed."

## Implementation Notes

The spec exempts exactly one file from the scan: `MDs/livestage-spec.md` itself
(this spec is the sole document permitted to reference the donor, and it does
not ship). The donor checkout at `~/projects/markdownai` is outside the repo
and outside scan scope entirely, not merely exempted.

## Data Model

N/A.

## API/Interface

N/A. This SPEC is satisfied by a scan script (owned by feature 42, Contract
Scans), not by a directive or CLI verb of its own.

## Business Rules

1. Zero occurrences of donor brand strings, former package scopes, or former
   binary names in `src/`, `dist/`, shipped docs, CLI output, or error
   messages (line 711-713).
2. The scan is case-insensitive (line 713-714).
3. `MDs/livestage-spec.md` is the sole exception and does not ship; the donor
   checkout is outside the repo and outside scan scope (line 714-716).

## Acceptance Criteria

- [x] Grep-based scan across `src/`, `dist/`, shipped docs, CLI output
      strings, and error messages finds zero donor identity hits. Fully
      clean as of wave 4 (feature 31, Init): `src/cli/commands/init.ts` and
      `src/cli/templates/claude-section.ts` were the last two files,
      resolved. Test fixtures under `tests/` are clean too (the sole
      remaining string match is `.not.toContain('markdownai')`, a negative
      assertion, not a mention).
- [x] Scan is case-insensitive (`grep -i` used throughout verification).
- [x] Scan explicitly excludes `MDs/livestage-spec.md`.

## Dependencies

None (this SPEC has no dependencies; it is a foundational contract).

## Known Issues

RESOLVED in wave 4, feature 31 (Init). See frontmatter `known_issues` above.
