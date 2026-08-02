---
id: 10-security-policy-core
title: Security Policy Core
type: COMPONENT
path: Security / Policy Core
source_files: [src/engine/security/policy.ts, src/engine/security/surfaces.ts, src/engine/security/immutable.ts, src/engine/security/masking.ts, src/engine/security/profiles.ts]
status: planned
phase: idle
last_synced: 2026-08-01
initiative: livestage
wave: livestage-wave-1
depends_on: [07-package-skeleton, 06-cr5-deny-by-default]
tags: [policy, allowlist, immutable-rules, masking, strict-profile, per-invocation-reload]
known_issues: []
integration_contracts:
  - function: enforcePolicy
    when: always
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

- [ ] Policy reload: editing `.livestage/policy.json` between two invocations
      changes behavior on the very next one, no restart.
- [ ] `security show` prints the effective policy.
- [ ] `security shell test "<cmd>"` returns correct ALLOWED/BLOCKED plus
      reason for allowed and denied fixture commands.
- [ ] The `@code` carve-out test: an engine-built runner invocation
      (temp-file based) passes even though `node -e ...` is always-blocked.
- [ ] Masking applies to output before cache and before any trace record.

## Dependencies

07-package-skeleton, 06-cr5-deny-by-default (this component is what makes
CR-5 true at runtime).

## Known Issues

None.
