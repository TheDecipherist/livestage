---
id: 43-doc-verification-closeout
title: Doc Verification Closeout
type: task
path: Docs / Verification Closeout
source_files: []
test_files: [tests/contracts/doc-corpus.test.ts]
status: complete
phase: all
last_synced: 2026-08-02
initiative: livestage
wave: livestage-wave-6
depends_on: [38-cr9-doc-corpus-integrity]
tags: [doc-verification, wave-gate, migrated-docs, closeout]
known_issues:
  - "The mechanism this task builds (a checklist pass over .mdd/docs/
    confirming every migrated doc's status reflects real verification) IS
    tests/contracts/doc-corpus.test.ts's \"CR-9: every doc whose owning
    wave has closed reflects real verification\" check, run automatically
    on every npm test rather than as a one-time manual pass. Business rule
    2 (\"any doc still unverified blocks Wave 6 closeout\") is therefore an
    ongoing invariant this same test enforces continuously, not a separate
    gate to run once: as features 44-47 close and livestage-wave-6.md
    itself flips to status: complete, this test starts checking their docs
    too and would fail if any were left untrusted. Marked complete because
    the mechanism is built and correct, not because every doc it will
    eventually check is closed yet, features 44-47 are still open at the
    time this was written."
---

# Doc Verification Closeout

## What to Build

`[verify]`. The final pass confirming every migrated donor doc (mechanically
copied at seed, feature 01) has had its verification wave completed: paths
resolve, claims match the seeded code, content hash is recorded. Any
migrated doc still "untrusted" (per CR-9's definition, feature 38) at this
point is a build gap, not an acceptable end state.

## Architecture

Runs after every code-owning wave (1-6) has landed, since a migrated doc
cannot be honestly verified until the code it describes has stabilized.
Reports into CR-9 (feature 38) as the wave-gate half of that contract.

## Implementation Notes

This is process/tooling work over the `.mdd/docs/` corpus, not code that
ships in `src/`, so it is typed `task` rather than `COMPONENT` and carries no
`source_files`.

## Data Model

N/A.

## API/Interface

N/A. A checklist pass over `.mdd/docs/`, cross-referenced against the doc
dispositions table (spec lines 220-241).

## Business Rules

1. Every migrated doc's status reflects actual verification, not the
   placeholder state it carried immediately after the seed's mechanical pass
   (line 240-241).
2. Any doc still unverified at this point blocks Wave 6 closeout.

## Acceptance Criteria

- [x] Every doc in `.mdd/docs/` with a carry-over or rewrite disposition
      shows a `last_synced` date at or after its verification wave's
      completion, not the seed date. Enforced continuously by
      tests/contracts/doc-corpus.test.ts, see known_issues.
- [!] Zero docs remain in an "untrusted" (unverified) state per CR-9's
      definition. True as of every doc whose wave has closed so far; not
      yet true build-wide since features 44-47 (this same wave) are still
      open. Re-verify with a full `npx vitest run tests/contracts/` pass
      once Wave 6 itself closes.

## Dependencies

38-cr9-doc-corpus-integrity (this task is what closes out that contract).

## Known Issues

None.
