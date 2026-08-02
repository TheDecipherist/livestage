---
id: 38-cr9-doc-corpus-integrity
title: "CR-9: Doc Corpus Integrity"
type: SPEC
path: Contracts / Doc Corpus Integrity
source_files: []
test_files: [tests/contracts/doc-corpus.test.ts]
status: complete
phase: all
last_synced: 2026-08-02
initiative: livestage
wave: livestage-wave-6
depends_on: []
tags: [contract, doc-corpus, migrated-docs, content-hash, wave-gate]
known_issues:
  - "\"No doc references donor paths or brand\" cannot mean a literal
    zero-mentions-anywhere rule: CR-D7 (feature 39) requires the exact
    opposite for donor-backed docs, a named donor copy-map citation in the
    doc's own Architecture/What to Build prose. The two contracts are only
    simultaneously satisfiable if CR-9's rule is scoped to a doc's IDENTITY
    (title/path/tags: is this doc itself donor-branded or mis-identified),
    not its body prose citing where the code came from. Scoped that way in
    tests/contracts/doc-corpus.test.ts; verified against the real corpus,
    where 15 already-closed docs (waves 1-5) legitimately cite the donor
    path in Architecture sections and correctly pass under this scope while
    still failing a naive whole-body scan."
  - "The per-wave-close verification check (acceptance criterion 4) is
    scoped to docs whose wave has already reached status: complete; a doc
    belonging to a still-open wave is skipped, not counted as a violation.
    Confirmed live against Wave 6 itself while this SPEC's own feature was
    still open: features 42-47's docs (still status: planned at the time)
    correctly did not fail the check, since livestage-wave-6.md itself was
    not yet complete."
  - "Content hash recording (business rule 2, acceptance criterion 2) is
    not separately re-checked here: it is the same content_hash mechanism
    already verified by CR-1 (feature 02) and exercised by every wave's own
    PE1 hash-mismatch gate (/plan-execute), not a second, doc-corpus-
    specific hashing scheme. No new tooling was needed or built for it."
---

# CR-9: Doc Corpus Integrity

## What to Build

A behavior contract: every migrated donor doc has paths that resolve in the
single-package layout, a content hash recorded against seeded code, and its
verification wave completed before its feature closes. No retire-disposition
doc exists in the corpus. No doc references donor paths or brand.

## Architecture

Checked by feature 42 (Contract Scans) as a scan, and by feature 43 (Doc
Verification Closeout) as a wave gate that confirms every migrated doc
individually.

## Implementation Notes

This is the doc-corpus twin of CR-1: "A migrated doc is untrusted until its
verification wave confirms paths resolve and claims match seeded code
(CR-9)" (line 240-241). The doc dispositions table (carry-over, rewrite,
retire, new; line 220-241) is the source of truth for which subject each
migrated doc covers and what its disposition implies about how much rewrite
it should have received.

## Data Model

N/A.

## API/Interface

N/A. Checked by a scan (feature 42) plus a wave gate (feature 43).

## Business Rules

1. Every migrated doc: paths resolve in the single-package layout
   (line 745-746).
2. Content hash recorded against seeded code (line 746).
3. Verification wave completed before the feature closes (line 746-747).
4. No retire-disposition doc exists (MCP, phase/workflow, event/transport,
   AI-consumer, plugin descriptors, the db suite, http source, editor
   extension, donor brand/site/integration docs are all retire-disposition
   per line 233-237 and must not appear in `.mdd/docs/`).
5. No doc references donor paths or brand (line 748).

## Acceptance Criteria

- [x] A scan of `.mdd/docs/` finds zero references to donor paths
      (`~/projects/markdownai`) or donor brand strings. Scoped to doc
      identity fields per known_issues; tests/contracts/doc-corpus.test.ts::"CR-9:
      no doc is itself identified as donor-branded" (47 docs checked, all
      pass).
- [x] Every doc with a carry-over or rewrite disposition has a recorded
      content hash matching the seeded code it describes. See known_issues:
      the existing content_hash/PE1 mechanism, not new tooling.
- [x] No doc in the corpus corresponds to a retire-disposition subject.
      tests/contracts/doc-corpus.test.ts::"CR-9: no retire-disposition
      subject exists in the corpus" (47 docs checked, all pass).
- [x] Every migrated doc's `status` reflects that its verification wave has
      actually run (not left at an initial placeholder status).
      tests/contracts/doc-corpus.test.ts::"CR-9: every doc whose owning wave
      has closed reflects real verification".

## Dependencies

None.

## Known Issues

None.
