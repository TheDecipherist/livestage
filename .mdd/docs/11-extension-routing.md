---
id: 11-extension-routing
title: Extension Routing (Hook)
type: COMPONENT
path: Hook / Extension Routing
source_files: [src/hook/pretooluse.ts]
status: complete
phase: all
last_synced: 2026-08-01
initiative: livestage
wave: livestage-wave-1
depends_on: [09-grammar-parser, 04-cr3-stage-only]
tags: [hook, pretooluse, extension-match, fail-open, cache-substitution]
known_issues:
  - "SETTLED (was flagged in this doc's Known Issues as needing a decision): the hook substitution mechanism is PostToolUse, not PreToolUse. PreToolUse can only allow/deny/rewrite tool ARGUMENTS (updatedInput); it cannot substitute Read's returned content. PostToolUse can, via hookSpecificOutput.updatedToolOutput.content. The file is still named pretooluse.ts (matches the spec's file layout / this doc's source_files) but registers as a PostToolUse hook in Claude Code's settings.json; this is a filename/registered-event mismatch worth flagging to whoever wires init.ts's hook installation (feature 31)."
  - "The donor hook.ts (content-sniffing @markdownai + .md, routing to a nonexistent 'mcp' target) is deleted, not patched. pretooluse.ts replaces it entirely."
  - "Real timeout required spawning the built CLI as a child process (spawnSync with a timeout kills via SIGTERM); an in-process call to execute() cannot be interrupted once a synchronous engine operation (e.g. a slow @query) is underway. This also gives 'calls the same code path as cli render' literally, at the cost of the boundary-lint test checking for a subprocess invocation of the built cli.js rather than a static import (eslint's no-restricted-imports can only forbid, not require, so this was always going to be a test either way, see feature 08)."
  - "Found and fixed two real bugs while building this: (1) the spawned CLI process never passed --cwd, so it resolved .livestage/policy.json against the hook's own launch directory instead of the target project, silently applying the wrong security grants. (2) src/cli/cli.ts's package.json version lookup used one level of relative-path traversal (../package.json) but needed two (../../package.json) from src/cli/ or dist/cli/ to reach the repo root; this crashed the CLI binary outright on every invocation (never caught before because prior verification only ever called library functions like runRender directly, never the actual cli.js entry point). Also renamed program.name('mai') -> program.name('livestage') while fixing this line (CR-1)."
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

- [x] A simulated `.stage` read through the hook produces markdown identical
      to `cli render` on the same file with no args. Verified live and in
      `tests/unit/hook/pretooluse.test.ts`.
- [x] A `.md` file with directive-like content is never routed to the engine
      by the hook. Verified: pure extension match on `.stage`, no content
      sniffing.
- [x] A render that exceeds the timeout returns the degraded banner plus
      strip output. Verified live and in a permanent test: a short custom
      timeout against a genuinely slow `@query "sleep 2"` is killed via
      SIGTERM in ~300ms, not left to run the full 2s.
- [!] ...and the trace record has `degraded: true`. NOT wired: the spawned
      child process's own trace run is a separate process/invocation from
      the hook's; the hook does not currently emit its own trace span
      recording the degraded fallback. Gap, not fixed here.
- [x] An engine error during hook render still returns the raw file content
      (fail open), never an exception surfaced to the caller. `handlePostToolUse`
      never throws (verified: a malformed/unclosed-block fixture returns a
      degraded banner, not an exception); on a missing file it returns `{}`
      unchanged.
- [x] `.stage` files referenced via `@include`/`@import`/`@template` resolve
      relative to the including document and respect filesystem policy.
      Pre-existing engine behavior (`engine-include.ts`), unchanged by this
      component, covered by the existing merged test suite.

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
