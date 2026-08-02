---
id: 11-extension-routing
title: Extension Routing (Hook)
type: COMPONENT
path: Hook / Extension Routing
source_files: [src/hook/pretooluse.ts]
status: planned
phase: idle
last_synced: 2026-08-01
initiative: livestage
wave: livestage-wave-1
depends_on: [09-grammar-parser, 04-cr3-stage-only]
tags: [hook, pretooluse, extension-match, fail-open, cache-substitution]
known_issues: []
---

# Extension Routing (Hook)

## What to Build

`[new; donor hook plumbing]`. The PreToolUse hook: fires on file-read tool
calls whose path ends in `.stage` (pure extension match, nothing else).
Renders via the same code path as `cli render` (no args, deterministic-off,
policy fresh) into `.livestage/cache/`, and substitutes the rendered file for
the read. Also covers `.stage` resolution inside `@include`/`@import`/
`@template` (path resolution relative to the including document).

## Architecture

This is the component CR-3 (feature 04) depends on being correct: the hook
must call into `src/cli`'s render entry point (enforced by boundary lint,
feature 08), never a parallel render implementation, so hook and CLI behavior
can never drift.

## Implementation Notes

Render timeout (default 5000 ms, configurable) fails open: the hook
substitutes the strip output (fallback texts) with a leading
`> [!NOTE] degraded render` banner, and the trace records `degraded: true`.
Any hook error fails open to the raw file (line 471-474). The hook never
fires on any other extension (CR-3, feature 04).

The exact hook substitution mechanism (rendered-cache path rewrite vs.
deny-and-replace) is flagged in the spec's Known Gaps as something to settle
against the current Claude Code hook API in Wave 1 and document here
(line 862-864, Known gaps) - see Known Issues below.

## Data Model

N/A (the hook consumes the same render result shape as `cli render`; no
separate schema).

## API/Interface

PreToolUse hook entry point: given a tool-call file path, returns either the
rendered markdown (substituted for the read) or, on timeout/error, the
degraded strip output with a banner. No CLI verb of its own; invoked by the
Claude Code hook runtime.

## Business Rules

1. Fires on file-read tool calls whose path ends in `.stage`, pure extension
   match, nothing else (line 467-468).
2. Renders via the same code path as `cli render`: no args, deterministic
   off, policy fresh (line 468-469).
3. Substitutes the rendered file for the read via `.livestage/cache/`
   (line 469-470).
4. Render timeout (default 5000 ms, configurable) fails open: strip output
   plus a `> [!NOTE] degraded render` banner; trace records `degraded: true`
   (line 470-473).
5. Any hook error fails open to the raw file (line 473-474).
6. Never fires on any other extension (line 474, CR-3).
7. `.stage` resolution in `include`/`import`/`template` is relative to the
   including document, subject to filesystem policy (line 322-324).

## Acceptance Criteria

- [ ] A simulated `.stage` read through the hook produces markdown identical
      to `cli render` on the same file with no args.
- [ ] A `.md` file with directive-like content is never routed to the engine
      by the hook.
- [ ] A render that exceeds the timeout returns the degraded banner plus
      strip output, and the trace record has `degraded: true`.
- [ ] An engine error during hook render still returns the raw file content
      (fail open), never an exception surfaced to the caller.
- [ ] `.stage` files referenced via `@include`/`@import`/`@template` resolve
      relative to the including document and respect filesystem policy.

## Dependencies

09-grammar-parser (needs the parser to resolve `.stage` includes),
04-cr3-stage-only (this component is what makes CR-3 true).

## Known Issues

The hook substitution mechanism (rendered-cache path rewrite vs. deny-and-
replace) needs to be settled against the current Claude Code hook API and
documented here during Wave 1 build (spec line 862-864); this doc will be
updated once that decision is made.

Linguist/TextMate grammar for `.stage` on code hosts is parked with the
editor work and is not a v1.0 dependency for this component or the hook API
decision above (spec line 891-894).
