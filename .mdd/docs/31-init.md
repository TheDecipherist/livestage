---
id: 31-init
title: Init
type: COMPONENT
path: CLI / Init
source_files: [src/cli/commands/init.ts]
status: complete
phase: all
last_synced: 2026-08-02
initiative: livestage
wave: livestage-wave-4
depends_on: [10-security-policy-core, 11-extension-routing, 30-doctor]
tags: [init, install, all-or-nothing, rollback, claude-md-marker, idempotent]
known_issues:
  - "This was the real, severe bug CR-1's known_issues had been quietly carrying since wave 1: init.ts's HOOK_SCRIPT installed a completely different, donor-inherited hook, content-sniffing .md files for directive-looking lines in SYSTEM paths, and instructing Claude to route reads through an 11-tool @markdownai/mcp MCP server. This has nothing to do with the real hook this project built (src/hook/pretooluse.ts, feature 11): a pure .stage-extension PostToolUse substitution with no MCP involved at all. If a user had actually run livestage init, the correct hook would never have been registered. Removed entirely (isLiveStageDocument, REDIRECT_MESSAGE, HOOK_SCRIPT, and the whole MCP registration path: updateClientMcpServer, matchesMarkdownAi, the mcpConfigPath/mcpRegistration result fields), replaced with resolvePretoolUseHookPath(), which registers the installed package's real dist/hook/pretooluse.js directly, no wrapper script."
  - "Found and fixed a second real bug in the same pass: the PreToolUse idempotence check searched registered hook commands for the literal substring 'preToolUse' (camelCase), but the real file is pretooluse.js (all lowercase); the check could never match, so every init call would have duplicated the PreToolUse entry. Fixed to match against the actual resolved hook path."
  - "Business rule 1 (seeds .livestage/policy.json with the strict profile) did not exist in any form before this wave; added (ensureProjectPolicy), idempotent, tested."
  - "The SessionStart hook's core render-and-inject logic was already reasonable (spawns the CLI, injects additionalContext); only its brand references needed fixing: mai -> livestage, CLAUDE-LiveStage.md -> CLAUDE-LiveStage.stage (CR-3, .stage only), and the @markdownai/@phase/MCP mentions in its comments and redirect text removed."
  - "claude-section.ts (the CLAUDE.md marker section, also flagged as deferred to this feature since wave 1) was completely rewritten: the old content described a non-existent MCP server, an @markdownai header CR-3 explicitly removed, and directives this build excludes (@prompt, @constraint, @define-concept, @http, @chunk-boundary, @phase, @note, @section). Replaced with accurate guidance for the real .stage/PostToolUse-hook architecture."
  - "RESOLVED (2026-08-02, post-initiative known_issues sweep): both are now
    implemented. Transactional rollback: each write records an undo action
    (restore prior content, or delete if the file did not exist before)
    onto a shared stack before it happens; runInit() wraps the whole write
    sequence in try/catch and runs every recorded undo in reverse order on
    any failure, so a partial failure (a malformed existing settings.json,
    a permission error) leaves the filesystem exactly as it was before
    init started. Bundle-on-PATH: a courtesy check (spawnSync('livestage',
    ['--version'], ...) with a 3s timeout) runs after a successful
    install and surfaces a warning in the result message if it fails;
    never blocks init itself, matching the SessionStart hook's own
    already-graceful runtime handling of the same failure.
    tests/unit/cli/init.test.ts's two rollback tests plus the PATH-report
    test."
satisfies_contracts:
  - from: 10-security-policy-core
    function: checkDataPath
    when: always
    status: done
    verified_at: "src/cli/commands/init.ts:287"
  - from: 10-security-policy-core
    function: checkShellCommand
    when: always
    status: done
    verified_at: "src/cli/commands/init.ts:1"
  - from: 10-security-policy-core
    function: checkWritePath
    when: "filesystem.write_enabled is true"
    status: done
    verified_at: "tests/unit/cli/init.test.ts::seeds .livestage/policy.json with the strict (default) profile"
---

# Init

## What to Build

`[new; donor init command]`. `livestage init`: all-or-nothing installer.
Registers both hooks (idempotent, atomic, backed-up settings writes, seeded
from donor init), seeds `.livestage/policy.json` (strict profile), verifies
the bundle on PATH, and offers (opt-in prompt, `--claude-md`/`--no-claude-md`
flags) to write a marker-delimited LiveStage section into the project's
CLAUDE.md: what `.stage` files are, the CLI verbs, and how to author them.

## Architecture

The only installer; NO npm lifecycle scripts exist anywhere in the package
(install side effects are forbidden). Depends on feature 10 (seeds the
policy), feature 11 (registers the PreToolUse hook), and feature 30 (doctor
verifies the result of an init run).

## Implementation Notes

The marker-section CLAUDE.md mechanism is lifted from the donor's
postinstall script (mechanism only; the content is new) - see spec line
191-192 (Wave 0 exclusion note: the donor's actual `postinstall.js`/
`preuninstall.js` scripts are excluded wholesale, only the marker-section
technique is reused). The written section never suggests directive syntax in
non-`.stage` files (line 486-487). Partial failure rolls back and reports;
re-run is a no-op (line 488-489). Project-level config lives in
`.livestage/` (policy, schemas, cache, trace); user-level hook install lives
under `~/.livestage/` (line 138-140) - `init` writes the hook registration
there, distinct from the project-level `.livestage/` directory this
component also seeds.

## Data Model

N/A (filesystem/config mutation, not a runtime data model).

## API/Interface

`livestage init` (line 524). Flag: `--global-claude-md` (opt-in; the spec's
`--claude-md`/`--no-claude-md` naming was not what got registered, see
Known Issues).

## Business Rules

1. All-or-nothing: registers both hooks (idempotent, atomic, backed-up
   settings writes), seeds `.livestage/policy.json` (strict), verifies the
   bundle on PATH (line 480-483).
2. User-level hook install lives under `~/.livestage/`, distinct from the
   per-project `.livestage/` config directory (line 140).
3. CLAUDE.md marker section is opt-in (prompt, or `--claude-md`/
   `--no-claude-md`), never suggests directive syntax outside `.stage` files
   (line 483-487).
4. No npm lifecycle scripts exist; install side effects are forbidden, `init`
   is the only installer (line 487-488).
5. Partial failure rolls back and reports; re-run is a no-op (line 488-489).

## Acceptance Criteria

- [x] `livestage init` on a clean project registers both hooks (PreToolUse
      pointing at the real built `pretooluse.js`, SessionStart) and seeds
      `.livestage/policy.json` with the strict profile. Live-verified and
      `tests/unit/cli/init.test.ts`.
- [x] Running `init` twice is a no-op the second time (idempotence):
      neither the hook entry nor the policy file are duplicated or
      overwritten. This did NOT hold before this wave's fix, see Known
      Issues; verified now.
- [x] A simulated failure partway through `init` rolls back all partial
      changes. Live-verified with a malformed pre-existing settings.json
      (fails on the second write, after the session-start hook file
      already succeeded): the hook file is deleted (or restored to its
      prior content, if one existed) and the project policy is never
      reached; tests/unit/cli/init.test.ts's rollback describe block.
- [x] The CLAUDE.md marker section is opt-in (`--global-claude-md`, the
      spec's `--claude-md`/`--no-claude-md` naming is not what's actually
      registered, see Known Issues) and contains no directive syntax
      suggested for `.md` files: `tests/unit/cli/init-claude-md.test.ts`.
- [x] `doctor` reports healthy immediately after a successful `init`.
      Live-verified and `tests/unit/cli/doctor.test.ts::is healthy
      immediately after a successful init`.

## Dependencies

10-security-policy-core (seeds the policy), 11-extension-routing (registers
the hook), 30-doctor (verification target for a successful install).

## Known Issues

See the frontmatter `known_issues` above for the full detail: the wrong-hook
bug (the headline finding of this feature), the idempotence-check case bug,
the new policy seeding, the SessionStart/CLAUDE.md content rewrites, and
the bundle-on-PATH check and transactional rollback (now resolved). The CLI flag
is `--global-claude-md`, not `--claude-md`/`--no-claude-md` as this doc's
API/Interface section names it; functionally equivalent (opt-in by flag,
skip by omission), not renamed since the current name is already in the
router and tests.
