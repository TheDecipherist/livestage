---
id: 40-pattern-example
title: Pattern Example
type: COMPONENT
path: Examples / Pattern Example
source_files: [examples/multi-step/index.stage, examples/multi-step/state.stage, examples/multi-step/01-collect.stage, examples/multi-step/02-analyze.stage, examples/multi-step/03-report.stage]
status: planned
phase: idle
last_synced: 2026-08-01
initiative: livestage
wave: livestage-wave-6
depends_on: [19-composition-directives, 24-fallback-contract, 33-update-frontmatter]
tags: [F-PATTERN, multi-step, state-machine, skipped-step, degraded-render]
known_issues: []
---

# Pattern Example

## What to Build

`[new]`. The worked multi-step example directory (F-PATTERN) plus its guide
doc, proving multi-step agent work as a shipped *pattern* (files as steps,
frontmatter as state, assertions as gates) rather than workflow-engine
machinery. Files: `index.stage`, `state.stage`,
`01-collect.stage`, `02-analyze.stage`, `03-report.stage`.

## Architecture

Demonstrates composition (feature 19), the fallback contract's degraded-
render path (feature 24), and `@update-frontmatter` for state round-tripping
(feature 33) working together as the canonical answer to "how do I do
multi-step work without a workflow engine."

## Implementation Notes

This is the proof for the "Not a workflow engine" exclusion (line 47-49):
"Multi-step work is a shipped *pattern* (files as steps, frontmatter as
state, assertions as gates), not machinery." The e2e test for this example
must include three failure modes explicitly: skipped-step, stale-state,
degraded-render (line 673).

## Data Model

`state.stage`'s frontmatter is the state store: which step last completed,
what its outputs were, timestamps. Schema-validated (feature 32) if a schema
is declared for this document class.

## API/Interface

No new directive; this is a worked example composed entirely from existing
directives (`@if`, `@foreach`, `@update-frontmatter`, `@assert`, `@read-
frontmatter`).

## Business Rules

1. The example renders green when steps run in sequence (line 668-669).
2. The example renders red (fails an assertion) when steps run out of
   sequence (line 669).
3. State round-trips through schema-validated frontmatter (line 669-670,
   631-632 shared with feature 33).
4. The e2e test covers skipped-step, stale-state, and degraded-render
   failure modes explicitly (line 673).

## Acceptance Criteria

- [ ] Running steps `01`, `02`, `03` in order renders green end to end
      (Wave 6 demo-state, line 667-669).
- [ ] Running `02` before `01` (skipped-step) renders red via an assertion
      failure, not a silent wrong answer.
- [ ] Stale state (state.stage frontmatter from a prior, now-invalid run)
      is detected and reported, not silently trusted.
- [ ] A degraded render (simulated hook timeout mid-sequence) still leaves
      the example in a state a human or agent can recover from.

## Dependencies

19-composition-directives (control flow across steps), 24-fallback-contract
(degraded-render failure mode), 33-update-frontmatter (state round-trip).

## Known Issues

None.
