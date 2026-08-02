---
id: 39-cr-d7-reuse-fidelity
title: "CR-D7: Reuse Fidelity"
type: SPEC
path: Contracts / Reuse Fidelity
source_files: []
status: planned
phase: idle
last_synced: 2026-08-01
initiative: livestage
wave: livestage-wave-6
depends_on: []
tags: [contract, reuse-fidelity, donor-copy, wave-review-gate, code-and-docs]
known_issues: []
---

# CR-D7: Reuse Fidelity

## What to Build

A behavior contract, code and docs: for every `[verify]` component and every
`[new]` component with a named donor subsystem, the wave record names the
donor path copied from; implementing one without the donor copy is a wave
failure. For every feature doc whose subject has a carry-over or rewrite
disposition, the doc must originate from the migrated donor doc, never from
scratch; a fresh doc written where a donor doc exists is a wave failure.

## Architecture

This is the load-bearing rule stated at the top of the spec (line 23-36) made
into a checked gate: "Nothing that exists in the donor is ever written
again... Writing code the donor already has, or a doc the donor corpus
already has, is a wave failure (CR-D7)." Checked by feature 42's scan for the
code half, and by a wave review gate for the doc half.

## Implementation Notes

Principle 6 states the same rule at the principle level: "Copy first, never
rewrite, code AND docs" (line 103-112). The standing instruction for every
wave task is explicit: "step one is always the donor. Open the copy-map row,
read the donor source and its tests, read the migrated doc" (line 560-564).

## Data Model

N/A.

## API/Interface

N/A. Enforced by wave review (a checklist item per wave: did each `[verify]`/
donor-backed `[new]` task cite its donor copy source?) plus feature 42's
scan for donor-identity leakage as a proxy signal.

## Business Rules

1. Every `[verify]` component and every `[new]` component with a named donor
   subsystem: the wave record names the donor path copied from (line
   758-760).
2. Implementing one without the donor copy is a wave failure (line 759-760).
3. Every feature doc with a carry-over or rewrite disposition must originate
   from the migrated donor doc, never from scratch (line 760-762).
4. A fresh doc written where a donor doc exists is a wave failure (line
   762-763).

## Acceptance Criteria

- [ ] For each of this build's own `[verify]`/donor-backed `[new]` features
      (this initiative's own docs, e.g. 09-grammar-parser, 17-source-
      directives), the doc's Architecture/Implementation Notes section names
      the donor copy-map source path (self-referential check: this import
      itself follows CR-D7 by copying the spec's own copy-map lines into
      each such doc, verified above in this batch of writes).
- [ ] A wave review checklist item exists and is exercised at the end of
      each wave, confirming donor citations for that wave's `[verify]`/
      donor-backed `[new]` items.
- [ ] No feature doc in `.mdd/docs/` for a carry-over/rewrite-disposition
      subject was authored without reference to a migrated donor doc.

## Dependencies

None.

## Known Issues

None.
