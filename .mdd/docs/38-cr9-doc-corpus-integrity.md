---
id: 38-cr9-doc-corpus-integrity
title: "CR-9: Doc Corpus Integrity"
type: SPEC
path: Contracts / Doc Corpus Integrity
source_files: []
status: planned
phase: idle
last_synced: 2026-08-01
initiative: livestage
wave: livestage-wave-6
depends_on: []
tags: [contract, doc-corpus, migrated-docs, content-hash, wave-gate]
known_issues: []
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

- [ ] A scan of `.mdd/docs/` finds zero references to donor paths
      (`~/projects/markdownai`) or donor brand strings.
- [ ] Every doc with a carry-over or rewrite disposition has a recorded
      content hash matching the seeded code it describes.
- [ ] No doc in the corpus corresponds to a retire-disposition subject.
- [ ] Every migrated doc's `status` reflects that its verification wave has
      actually run (not left at an initial placeholder status).

## Dependencies

None.

## Known Issues

None.
