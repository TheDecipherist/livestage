---
id: 10-security-policy-core
title: Security Policy Core
type: COMPONENT
path: Security / Policy Core
source_files: [src/engine/security/config.ts, src/engine/security/rules.ts, src/engine/security/shell.ts, src/engine/security/filesystem.ts, src/engine/security/masking.ts, src/engine/security/audit.ts, src/engine/security/path-expand.ts, src/engine/security/modes.ts, src/cli/commands/security.ts, src/cli/cli-register-security.ts]
status: complete
phase: all
last_synced: 2026-08-01
initiative: livestage
wave: livestage-wave-1
depends_on: [07-package-skeleton, 06-cr5-deny-by-default]
tags: [policy, allowlist, immutable-rules, masking, strict-profile, per-invocation-reload]
known_issues:
  - "The doc's stated source_files (policy.ts, surfaces.ts, immutable.ts, profiles.ts) and integration_contracts function name (enforcePolicy) do not match the real code: there is no single unified enforcePolicy gate. The real architecture has per-surface check functions (checkShellCommand for shell, checkDataPath/checkWritePath for filesystem, checkAbsolutePath/checkFilePath for path jails). Corrected source_files and integration_contracts below to match reality rather than the plan-time guess."
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
