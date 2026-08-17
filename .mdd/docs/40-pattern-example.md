---
id: 40-pattern-example
title: Pattern Example
type: COMPONENT
path: Examples / Pattern Example
source_files: [examples/multi-step/index.stage, examples/multi-step/state.stage,
  examples/multi-step/01-collect.stage, examples/multi-step/02-analyze.stage,
  examples/multi-step/03-report.stage, examples/multi-step/README.md,
  examples/multi-step/.livestage/policy.json,
  examples/multi-step/.livestage/schemas/pipeline-state.json,
  src/engine/write-ops.ts, src/engine/assert/operators.ts,
  src/cli/commands/assert.ts, src/cli/commands/render.ts, src/cli/cli.ts,
  examples/multi-step/index.md]
test_files: [tests/e2e/pattern-example.test.ts, tests/e2e/all-examples-rendered.test.ts]
status: complete
phase: all
last_synced: 2026-08-17
initiative: livestage
wave: livestage-wave-6
depends_on: [19-composition-directives, 24-fallback-contract, 33-update-frontmatter]
tags: [F-PATTERN, multi-step, state-machine, skipped-step, degraded-render]
known_issues:
  - "Building this example surfaced two real, previously-undiscovered
    interpolation gaps, neither caught by any prior test because nothing
    before this feature combined --var/vars.* with @update-frontmatter's
    value= or @assert's equals=: (1) @update-frontmatter's value= attribute
    was never run through {{ }} interpolation at all (only path= was), so
    value=\"{{ vars.run_id }}\" wrote the literal template text into
    frontmatter instead of the resolved value. Fixed in write-ops.ts with
    the same interpolatePathSoft() call path= already used. (2) @assert's
    json-key equals= attribute had the identical gap; fixed the same way in
    assert/operators.ts. Both are one-line fixes once found, but the
    corruption they produce (a frontmatter field literally containing
    `{{ vars.run_id }}`) is not obviously wrong at a glance, which is why
    they survived undetected until an example that round-trips a runtime
    value through both directives exercised them."
  - "The `assert` CLI command had no --var/--args/skill-context flags at all
    before this feature (only `render` did), so a document whose @assert
    gates depend on a runtime value (equals=\"{{ vars.run_id }}\", exactly
    what this example's skipped-step/stale-state gates need) could never
    actually be checked via `livestage assert`, only rendered. Fixed by
    extracting render.ts's buildSkillContext into an exported helper
    (SkillContextOptions) and wiring the same --args/--var options and
    envFiles mirroring into assert.ts and its CLI registration."
  - "{{ }} interpolation deliberately does not touch inline code spans
    (single backtick) or fenced code blocks, by design, matching how
    markdown itself treats those spans as literal. The first draft of these
    example files wrapped {{ vars.run_id }} in backticks for markdown
    styling (`{{ vars.run_id }}`) and got the literal template text back
    in rendered output; not a bug, just a real trap for anyone writing
    LiveStage prose, worth flagging since it looks identical to the two
    real bugs above until you check whether backticks are involved."
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

- [x] Running steps `01`, `02`, `03` in order renders green end to end
      (Wave 6 demo-state, line 667-669). Live-verified via the built CLI;
      tests/e2e/pattern-example.test.ts::"running 01, 02, 03 in order
      renders green end to end".
- [x] Running `02` before `01` (skipped-step) renders red via an assertion
      failure, not a silent wrong answer. Live-verified (BLOCKED
      (skipped-step) message, `livestage assert` exits 1, state
      untouched); tests/e2e/pattern-example.test.ts::"running 02 before 01
      blocks...".
- [x] Stale state (state.stage frontmatter from a prior, now-invalid run)
      is detected and reported, not silently trusted. Live-verified
      (BLOCKED (stale-state), state from the refused run left untouched);
      tests/e2e/pattern-example.test.ts::"a state file from a different run
      is refused...".
- [x] A degraded render (simulated hook timeout mid-sequence) still leaves
      the example in a state a human or agent can recover from. Verified
      against a synthetic slow step via renderViaCli with a short timeout:
      state stays at its pre-step value when killed, and a normal re-run
      completes and updates it correctly, no manual repair needed;
      tests/e2e/pattern-example.test.ts::"degraded render leaves a
      recoverable state".

## Dependencies

19-composition-directives (control flow across steps), 24-fallback-contract
(degraded-render failure mode), 33-update-frontmatter (state round-trip).

## Known Issues

None.

## Bug Fixes

### B1 (fixed 2026-08-17)
Symptom: index.stage shipped no rendered .md output committed
alongside its .stage source. Same gap as 48-auto-readme-generation B1.
Cause: see 48-auto-readme-generation B1.
Fix: index.stage (pure @read-frontmatter, no writes) is exact-matched.
The three pipeline steps and state.stage are deliberately EXCLUDED from
any auto-rendering: they mutate the checked-in state.stage via
@update-frontmatter when run, so rendering them for a snapshot would
corrupt the demo fixture, a test/script mutating a git-tracked file as
an uncontrolled side effect of running (the exact failure class
CLAUDE.md warns against) | Regression test:
tests/e2e/all-examples-rendered.test.ts

### B2 (fixed 2026-08-17)
Symptom: index.stage's own prose wrapped `{{ state.run_id }}` in
backticks (an inline code span); rendered output showed the literal
text `{{ state.run_id }}` instead of the real value ("none"), while
the two adjacent, non-backtick-wrapped interpolations in the same
sentence resolved correctly. Found while rendering index.stage for the
first time (B1).
Cause: scanInterpolations deliberately skips {{ }} inside backtick
code spans (src/parser/interpolation.ts), so literal syntax examples
in documentation render as-is; this example's own prose used backticks
around a value it actually wanted interpolated, not shown as syntax.
Fix: examples/multi-step/index.stage (removed the backticks around
`{{ state.run_id }}`, matching the un-backticked style of the other
two interpolations in the same sentence) | Regression test:
tests/e2e/all-examples-rendered.test.ts::"multi-step/index.stage:
backtick-wrapped interpolation regression (B2)"
