---
id: 31-init
title: Init
type: COMPONENT
path: CLI / Init
source_files: [src/cli/commands/init.ts]
test_files: [tests/unit/cli/init.test.ts, tests/unit/cli/init-claude-md.test.ts, tests/unit/cli/init-session-start-hook.test.ts]
status: complete
phase: all
last_synced: 2026-08-17
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

## Feature Addition: --seed-from-permissions (2026-08-17)

`runInit` gained a `policySeed?: SecurityJsonConfig` option (default
unset, seeds the strict profile as before): when supplied, `ensureProjectPolicy`
writes it instead of `strictSecurityConfig()`. `runInit` itself stays a
pure function with no prompt of its own. The confirmation lives in the
CLI layer (`cli.ts`'s `--seed-from-permissions` flag, not part of this
doc's own `source_files`, see `10-security-policy-core.md`'s Feature
Addition entry for the full inheritance model): it derives suggested
`shell.allow_patterns` from the caller's Claude Code settings.allow Bash
rules via `deriveShellAllowPatternsFromSettings`, prints them, and builds
the `policySeed` only when the flag itself was passed, which is the
confirmation (see 10-security-policy-core.md for why an interactive y/N
readline prompt was scoped out this session). Also added: a `livestage
trust` CLI verb (`src/cli/commands/trust.ts`, owned by
10-security-policy-core.md alongside the trust store it wraps), unrelated
to `init` itself but part of the same feature.

## Known Issues

See the frontmatter `known_issues` above for the full detail: the wrong-hook
bug (the headline finding of this feature), the idempotence-check case bug,
the new policy seeding, the SessionStart/CLAUDE.md content rewrites, and
the bundle-on-PATH check and transactional rollback (now resolved). The CLI flag
is `--global-claude-md`, not `--claude-md`/`--no-claude-md` as this doc's
API/Interface section names it; functionally equivalent (opt-in by flag,
skip by omission), not renamed since the current name is already in the
router and tests.

## Bug Fixes

### B1 (fixed 2026-08-17)
Symptom: `ensureProjectPolicy`'s comment said it seeds "the strict
profile," which two independent pre-launch reviews both read as "shell
is off" or "conservative/minimal," then were surprised to find
`defaultSecurityConfig()` ships `shell.enabled: true` with ~40
read-only patterns (`git *`, `cat *`, `grep *`, `find *`, the common
test runners) granted out of the box.
Cause: not a code defect, a naming/communication one. "Strict" in this
project's vocabulary names the ENFORCEMENT MODEL (every surface not
explicitly granted is denied, immutable hard-blocks, `@code`/HTTP ship
empty, no reach outside the project root), not "shell is off." This is
documented, deliberate, and tested: `06-cr5-deny-by-default.md`'s own
Implementation Notes and known_issues record the shell allowlist being
widened mid-build specifically so `@query`/`@test`/`@check` would not
be "dead on arrival." Adding a second, more restrictive profile (as one
review's initial preference suggested) would have regressed that
already-fixed, tested behavior; rejected in favor of clarifying the
comment instead.
Fix: `src/cli/commands/init.ts`'s `ensureProjectPolicy` comment
(explains what "strict" means and why shell ships with a curated
allowlist); `README.stage`'s `Install` section (same clarification,
plus removed the false "nothing is granted beyond that" claim about
shell) | Regression test: tests/e2e/readme-generation.test.ts::"does
not claim the seeded default is shell-off or 'nothing runs by
default'". No behavior change; `ensureProjectPolicy` still seeds
exactly `defaultSecurityConfig()`, confirmed via a live `init` run
diffed against the function's own output.

### B2 (fixed 2026-08-17)
Symptom: the render-substitution hook (`src/hook/pretooluse.ts`, feature
11) was registered under `hooks['PreToolUse']` in the client's
`settings.json`, while the hook itself emits `hookEventName: 'PostToolUse'`
at runtime. Confirmed against Claude Code's Agent SDK hooks reference
(`/docs/en/agent-sdk/hooks`): "For `PostToolUse` hooks... To replace the
tool's output before Claude sees it, set `updatedToolOutput`, which works
for any tool in both SDKs. The older `updatedMCPToolOutput` field replaces
MCP tool output only and is deprecated." `PreToolUse` can only allow/deny/
rewrite a tool's ARGUMENTS (`updatedInput`); it has no mechanism to
substitute what a `Read` call returns. A user running a live session with
this registration got the raw `.stage` source back, directive syntax
intact, never the render: the inverse of this project's core promise. Doc
11's own `known_issues` had flagged this exact risk as SETTLED-but-unverified
("worth flagging to whoever wires init.ts's hook installation"); it shipped
anyway. Not caught by the existing suite: `tests/unit/hook/pretooluse.test.ts`
calls `handlePostToolUse()` directly, never through real dispatch, and the
old `tests/unit/cli/init.test.ts` asserted the entry landed under
`PreToolUse`, pinning the bug with a passing test.
Cause: `updateClientHooks` in `src/cli/commands/init.ts` hardcoded the
`hooks['PreToolUse']` key for this registration; nothing checked it against
what the hook module itself emits.
Fix: `updateClientHooks` now writes the entry under `hooks['PostToolUse']`,
and migrates a stale `PreToolUse` registration of the same hook command
(matched by command path, not key) to `PostToolUse` on the next `init` run
rather than leaving a dead duplicate. `tests/unit/cli/init.test.ts` gained
an invariant test that reads the emitted `hookEventName` straight out of
`pretooluse.ts`'s source and asserts the registered key matches it, so key
and emitted event can't diverge again silently, plus a migration test and a
"never under PreToolUse" test | Regression test:
`tests/unit/cli/init.test.ts`::"the registered hook key matches the
hookEventName the hook module itself emits", ::"running init after
upgrading migrates a stale PreToolUse registration...". Also added
`tests/e2e/hook-dispatch.test.ts`, which spawns the real built
`dist/hook/pretooluse.js` (and the installed `sessionStart.mjs`) with a
realistic stdin payload, the dispatch path `handlePostToolUse()`-only unit
tests never exercised.

### B3 (fixed 2026-08-17)
Symptom: `ensureProjectPolicy` seeded `defaultSecurityConfig()` (shell
enabled, ~44 wildcard `allow_patterns`) into every fresh project, so every
user running `livestage init` inherited a broad shell allowlist they never
authored or reviewed. B1 above investigated the same complaint and
concluded it was a naming/communication issue, not a behavior change,
explicitly rejecting a second, more restrictive profile.
Cause: reassessed on direct instruction. B1's reasoning (the allowlist is
tested and load-bearing for this project's own `@query`/`@test`/`@check`
usage) is true but answers the wrong question: `defaultSecurityConfig()`'s
permissiveness is right for its OTHER job, the fallback `loadSecurityConfig()`
returns when no policy file exists at all, but wrong as what a first-run
`init` hands a user who has reviewed nothing. A hostile `.stage` file
shipped inside a cloned repo (`docs/status.stage` next to a committed
`docs/.livestage/policy.json`) executes on read the moment that policy
grants shell, since the hook spawns its render with `--cwd
dirname(filePath)` (`pretooluse.ts`); a wide default allowlist widens that
blast radius for every project that never edited its seeded policy.
Fix: added `strictSecurityConfig()` (`src/engine/security/config.ts`):
shell off, `allow_patterns` empty, identical to `defaultSecurityConfig()`
everywhere else (`@code`/http stay off in both). `ensureProjectPolicy` now
seeds this instead of `defaultSecurityConfig()`, which keeps its original
job as `loadSecurityConfig()`'s missing-file fallback, unchanged. This
supersedes B1's rejection of a second profile; B1's naming clarification
(what "strict" means, in `06-cr5-deny-by-default.md` and the comments
here) stands as accurate background, it just no longer describes what
`init` seeds | Regression test:
`tests/unit/engine/security-config.test.ts`::"strictSecurityConfig vs
defaultSecurityConfig", `tests/unit/cli/init.test.ts`::"seeds
.livestage/policy.json with the real strict profile: shell off, no
patterns granted" (strengthened from a vacuous `code.languages` check,
which is `[]` in both profiles and never would have caught this).
