---
id: 11-extension-routing
title: Extension Routing (Hook)
type: COMPONENT
path: Hook / Extension Routing
source_files: [src/hook/pretooluse.ts, src/engine/index.ts]
status: complete
phase: all
last_synced: 2026-08-02
initiative: livestage
wave: livestage-wave-1
depends_on: [09-grammar-parser, 04-cr3-stage-only]
tags: [hook, pretooluse, extension-match, fail-open, cache-substitution]
known_issues:
  - "SETTLED (was flagged in this doc's Known Issues as needing a decision): the hook substitution mechanism is PostToolUse, not PreToolUse. PreToolUse can only allow/deny/rewrite tool ARGUMENTS (updatedInput); it cannot substitute Read's returned content. PostToolUse can, via hookSpecificOutput.updatedToolOutput.content. The file is still named pretooluse.ts (matches the spec's file layout / this doc's source_files) but registers as a PostToolUse hook in Claude Code's settings.json; this is a filename/registered-event mismatch worth flagging to whoever wires init.ts's hook installation (feature 31)."
  - "The donor hook.ts (content-sniffing @markdownai + .md, routing to a nonexistent 'mcp' target) is deleted, not patched. pretooluse.ts replaces it entirely."
  - "Real timeout required spawning the built CLI as a child process (spawnSync with a timeout kills via SIGTERM); an in-process call to execute() cannot be interrupted once a synchronous engine operation (e.g. a slow @query) is underway. This also gives 'calls the same code path as cli render' literally, at the cost of the boundary-lint test checking for a subprocess invocation of the built cli.js rather than a static import (eslint's no-restricted-imports can only forbid, not require, so this was always going to be a test either way, see feature 08)."
  - "Found and fixed two real bugs while building this: (1) the spawned CLI process never passed --cwd, so it resolved .livestage/policy.json against the hook's own launch directory instead of the target project, silently applying the wrong security grants. (2) src/cli/cli.ts's package.json version lookup used one level of relative-path traversal (../package.json) but needed two (../../package.json) from src/cli/ or dist/cli/ to reach the repo root; this crashed the CLI binary outright on every invocation (never caught before because prior verification only ever called library functions like runRender directly, never the actual cli.js entry point). Also renamed program.name('mai') -> program.name('livestage') while fixing this line (CR-1)."
  - "Found and fixed a real gap during wave 2 verification (feature 21, Cache): writeRenderCache wrote the fully rendered document straight to .livestage/cache/<hash>.md with no masking at all, bypassing cache.ts's applyMasking entirely (a separate, unmanaged cache location invisible to cache show/clear). A resolved secret-shaped value (e.g. from @env) sat on disk in plaintext indefinitely. Fixed by masking content before this write; the returned substitution (what the caller actually sees) is deliberately left unmasked, matching CR-5's rule that masking applies before cache/trace persistence, never to the primary render output. Test: tests/unit/hook/pretooluse.test.ts::the render cache artifact is masked even though the returned substitution is not."
  - "RESOLVED (2026-08-02, post-initiative known_issues sweep): the trace
    record's degraded: true flag is now wired. engine.ts's own render-level
    trace record hardcodes degraded: false, because the engine has no way
    to know it is running under a hook that might kill it mid-render; on a
    timeout the child never reaches that emitRecord call at all, so no
    trace record for the attempt existed anywhere. renderViaCli now emits
    its own record (using the same parseTraceConfig/emitRecord the engine
    uses, exported from the public livestage/engine barrel for this) when
    it falls back to the degraded banner, covering both the SIGTERM/timeout
    case and any other spawn-level failure. tests/unit/hook/pretooluse.test.ts's
    two new trace tests (one for the degraded case, one confirming a clean
    render does not add a spurious record)."
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
- [x] ...and the trace record has `degraded: true`. Live-verified (a
      timed-out render against a real trace file shows a
      `{"degraded":true,...}` line); tests/unit/hook/pretooluse.test.ts's
      "a timed-out render still gets a degraded: true trace record...".
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

SETTLED: the hook substitution mechanism is PostToolUse (`updatedToolOutput.
content`), not PreToolUse; see the frontmatter `known_issues` above for the
full reasoning. The file is still named `pretooluse.ts` to match the spec's
layout, but registers as a PostToolUse hook. The trace record's `degraded:
true` flag (previously not wired) is now resolved, see the frontmatter
`known_issues` above.

The trace record's `degraded: true` flag is not wired for a hook-side
timeout: the spawned child process's own trace run is a separate
process/invocation from the hook's, and the hook does not currently emit its
own trace span for the degraded fallback. Gap, not fixed here.

The render cache write (`.livestage/cache/<hash>.md`, keyed under the
document's own directory) is now masked before write; see the frontmatter
`known_issues` above for the bug this closes. It remains a separate
mechanism from `cache.ts`'s session/persist cache (feature 21): different
location, different key scheme, invisible to `cache show`/`cache clear`.
Unifying the two is out of scope here.

Linguist/TextMate grammar for `.stage` on code hosts is parked with the
editor work and is not a v1.0 dependency for this component (spec line
891-894).
