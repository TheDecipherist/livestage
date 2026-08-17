---
id: 10-security-policy-core
title: Security Policy Core
type: COMPONENT
path: Security / Policy Core
source_files: [src/engine/security/config.ts, src/engine/security/rules.ts, src/engine/security/shell.ts, src/engine/security/filesystem.ts, src/engine/security/masking.ts, src/engine/security/audit.ts, src/engine/security/path-expand.ts, src/engine/security/modes.ts, src/cli/commands/security.ts, src/cli/cli-register-security.ts]
test_files: [tests/unit/engine/security-config.test.ts, tests/unit/engine/security-filesystem.test.ts, tests/unit/engine/security-masking-shell.test.ts, tests/unit/engine/security-compound-commands.test.ts, tests/unit/engine/query-policy.test.ts, tests/unit/cli/cli-router.test.ts]
status: complete
phase: all
last_synced: 2026-08-17
initiative: livestage
wave: livestage-wave-1
depends_on: [07-package-skeleton, 06-cr5-deny-by-default]
tags: [policy, allowlist, immutable-rules, masking, strict-profile, per-invocation-reload]
known_issues:
  - "The doc's stated source_files (policy.ts, surfaces.ts, immutable.ts, profiles.ts) and integration_contracts function name (enforcePolicy) do not match the real code: there is no single unified enforcePolicy gate. The real architecture has per-surface check functions (checkShellCommand for shell, checkDataPath/checkWritePath for filesystem, checkAbsolutePath/checkFilePath for path jails). Corrected source_files and integration_contracts below to match reality rather than the plan-time guess."
  - "test_files was never backfilled when this doc was written (wave 1);
    found empty during an unrelated bug fix's frontmatter validation
    (2026-08-17). Corrected above from the real coverage:
    security-config/-filesystem/-masking-shell.test.ts and
    query-policy.test.ts exercise the per-surface check functions
    directly, cli-router.test.ts covers the CLI security command."
  - "Found and fixed a real gap while verifying: config, and the cache directory, both defaulted to the user's home directory (~/.livestage/security.json, ~/.livestage/cache), not the project-local .livestage/ the spec calls for (Tech Stack: 'Config home: .livestage/ in the project root: policy.json, schemas/, cache/, trace/'). Fixed config.ts's loadSecurityConfig default path, security.ts's CLI-facing path (also renamed security.json -> policy.json to match the spec), cache.ts's CACHE_DIR, and threaded render.ts's --cwd option through to config resolution. Audit log and error log were left at ~/.livestage/ (not explicitly named in the project-local list, and an operational log surviving outside any one project is defensible)."
  - "The @code carve-out acceptance criterion (an engine-built runner invocation passing despite node -e being always-blocked) cannot be verified: @code does not exist yet, it is feature 29 (Code Runners, wave 4)."
integration_contracts:
  - function: checkShellCommand
    when: always
    mandatory: true
  - function: checkDataPath
    when: always
    mandatory: true
  - function: checkWritePath
    when: "filesystem.write_enabled is true"
    mandatory: true
---

# Security Policy Core

## What to Build

`[verify: donor engine/security]`, copy from
`~/projects/markdownai/packages/engine/src/*` (security subtree). The policy
loader, the surface definitions (filesystem, shell, code), the immutable
always-block rules, secret masking, and the shipped `strict` profile. Loaded
fresh on every invocation (no caching across invocations, no restart needed
after a policy edit).

## Architecture

The single enforcement layer every execution surface resolves through
(Principle 5, line 98-100): `@query`/`@test`/`@check`/`@code`'s shell
invocations, and all filesystem access (including by the hook), pass through
this module. `enforcePolicy` is the gate function every consumer must call;
declared here as the `integration_contracts` provider so downstream
COMPONENTs (17 sources, 18 compute, 29 code-runners, 11 ext-routing) each
carry a matching `satisfies_contracts` entry once they wire the call.

## Implementation Notes

Post-interpolation enforcement (Principle 5) is a tested invariant, not just a
policy: enforcement happens after `{{ }}` expansion, so no interpolated value,
including user arguments, can smuggle a command, path, host, or query past
policy (line 100-102, 444-445). The immutable always-block list sits below
the policy layer and is unoverridable by any config file (line 431-434).

## Data Model

See feature 06 (CR-5) for the full shipped `strict` policy.json shape. Runtime
policy object: `{ profile, shell: { allow, deny, requireConfirmation,
auditLog }, code: { languages, timeout, runners }, filesystem: { deny,
allowOutside } }`.

## API/Interface

- `livestage security show|init|disable|shell enable|add|remove|list|test <cmd>`
  (line 528).
- `security shell test "<cmd>"` answers ALLOWED/BLOCKED with the reason
  (line 429).
- `doctor` reports per-surface grant state (line 447).

## Business Rules

See feature 06 (CR-5 Deny By Default) for the full rule set this component
satisfies; this doc covers only the implementation-specific rules:

1. Policy is loaded fresh per invocation; a policy edit is enforced by the
   very next render (line 69-70).
2. The `@code` carve-out is a named exception to the inline-execution
   always-block, stated precisely: engine-constructed runner invocations
   (built from the granted `code.runners` map, always executing a temp
   script file, never an inline `-e`/`-c` string) are the single sanctioned
   exception. A user's `@query "node -e ..."` remains always-blocked even if
   a pattern would allow it (line 436-441). This is a named Wave 4
   acceptance test (owned jointly with feature 29, Code Runners).
3. `doctor` reports per-surface grant state (line 447).

## Acceptance Criteria

- [x] Policy reload: editing `.livestage/policy.json` between two invocations
      changes behavior on the very next one, no restart. Verified live and in
      `tests/unit/engine/security-config.test.ts`.
- [x] `security show` prints the effective policy. Verified live.
- [x] `security shell test "<cmd>"` returns correct ALLOWED/BLOCKED plus
      reason for allowed and denied fixture commands. Verified live (`git
      status` -> allowed; `eval something` -> always_block).
- [ ] The `@code` carve-out test: an engine-built runner invocation
      (temp-file based) passes even though `node -e ...` is always-blocked.
      Cannot verify, `@code` does not exist yet (feature 29, wave 4).
- [x] Masking applies to output before cache and before any trace record.
      Verified by inspection: `cache.ts` calls `applyMasking` before every
      cache write; `engine.ts` builds `maskedArgs` via `applyMasking` before
      passing them to `emitSpan`.

## Dependencies

07-package-skeleton, 06-cr5-deny-by-default (this component is what makes
CR-5 true at runtime).

## Known Issues

None.

## Bug Fixes

### B1 (fixed 2026-08-17)
Symptom: `checkShellCommand`'s allowlist did not prevent command chaining
after an allowed prefix (e.g. an allow pattern of `git *` also permitted
`git log --oneline; touch pwned`).
Cause: `matchShellPattern`'s wildcard-to-regex conversion (`rules.ts`)
fully anchors the pattern (`^...$`) but `*` becomes `.*`, which matches
shell metacharacters (`;`, `&&`, `||`, `|`, backticks, `$()`) the same as
any other character; a command string containing an injected chained
command therefore passed the check as part of an allowed match, and the
caller then handed that same string to a real shell (spawnSync/execSync
with shell:true), which does interpret those characters. Two ways
untrusted data reached this: ordinary `{{ }}` interpolation resolving
into command= before the check ran (executeQuery/executeTest/
executeCheck), and `@foreach`/`@call` macro substitution (macros.ts).
Fix: no change to `checkShellCommand`/`matchShellPattern` themselves,
the allowlist still permits exactly the same commands it always did; the
fix quotes the VALUE before it ever reaches the check. See
17-source-directives B1 and 18-compute-directives B1
(`interpolateShellSafe`, `src/engine/engine-include.ts:74,86`) and
19-composition-directives B1 (`subStrShellSafe`,
`src/engine/macros.ts:86`) | Regression test:
tests/unit/engine/shell-command-chaining.test.ts

### B2 (fixed 2026-08-17)
Symptom: B1 above closed the interpolation route into command chaining
but explicitly left `checkShellCommand`/`matchShellPattern` unchanged,
reasoning untrusted data could only reach the check via interpolation
or macro substitution. That left the STATIC route open: a `.stage`
file's own literal, non-interpolated `@query "git status && rm -rf /"`
still matches allow pattern `git *` as one whole-string regex match
(`.*` matches `;`/`&&`/`||`/`|` the same as any other character), since
nothing ever validated a compound command per subcommand. The threat
model here is a malicious `.stage` file itself (e.g. one arriving via a
cloned repo alongside a permissive committed policy.json), not an
interpolated value; the author of the file needs no interpolation at
all to write the chain directly. Found while implementing the Claude
Code permission-inheritance feature, whose spec explicitly calls out
that Claude Code's own matcher checks each subcommand of a chain
independently and ours should too.
Cause: `checkShellCommand` never split a compound command before
matching; the allowlist/deny/immutable-block checks all ran once
against the full string.
Fix: added `splitCompoundCommand` (`rules.ts`), a quote-aware splitter
on `&&`/`||`/`;`/single `|` (careful to treat a backslash-escaped
operator, and `shellQuote()`'s own close-escape-reopen embedded-quote
idiom, as staying inside the logical span rather than as two separate
quoted regions). `checkShellCommand` now recurses per subcommand when
there is more than one, denying on the first subcommand that fails,
with no behavior change for a simple (non-chained) command | Regression
test: tests/unit/engine/security-compound-commands.test.ts
