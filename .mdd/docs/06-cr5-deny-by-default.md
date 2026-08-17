---
id: 06-cr5-deny-by-default
title: "CR-5: Deny By Default"
type: SPEC
path: Contracts / Deny By Default
source_files: []
status: complete
phase: all
last_synced: 2026-08-17
initiative: livestage
wave: livestage-wave-1
depends_on: []
tags: [contract, security, allowlist, immutable-rules, policy]
known_issues:
  - "[gap] Data Model's illustrative shell.allow list is stale: the real
    defaultSecurityConfig() (config.ts) ships 44 patterns, this example
    shows 31, missing whoami/id/hostname and several npm/pnpm variants
    added since this doc was last synced. Found during a pre-launch
    review, 2026-08-17. Low priority (illustrative example, not a
    behavior contract violation), deferred; the field name shown
    (\"allow\") also does not match the real config's allow_patterns,
    likely predates a rename."
  - "Found and fixed during wave 2 verification (feature 18, Compute Directives): the shipped strict profile's shell.allow_patterns had the pnpm/npx forms of every test-runner pattern (pnpm test*, pnpm run test*, etc.) but was missing the plain npm forms this doc's own Data Model documents (npm test*, npm run test*). Since exec-ops.ts's @test/@check auto-detect always shells out via npm run <script> regardless of the project's actual package manager, this meant @test / with no explicit command= was blocked by default on any project, including this one. Added npm test*, npm run test*, npm run typecheck*, npm run lint*, npm run build* to defaultSecurityConfig() in config.ts."
---

# CR-5: Deny By Default

## What to Build

A behavior contract: every shipped policy profile denies all surfaces it does
not explicitly grant. A test proves each surface (fs-outside-project, shell,
code) is unreachable without a grant, and that no policy file can defeat an
immutable rule.

## Architecture

The contract feature 10 (Security Policy Core) exists to satisfy. Policy is
loaded fresh per invocation (no restart, no stale-grant window, spec line
68-70), enforcement is post-interpolation (Principle 5, line 98-102), and
immutable rules sit below the policy layer, unoverridable by any config (line
431-443).

## Implementation Notes

The `strict` shipped profile (spec lines 400-421) is deliberately wider than
bare git (`@query` is the general shell escape hatch, `@test`/`@check` need
their runner patterns in the profile or they are dead on arrival), but it
remains deny-by-default: `code.languages` ships empty, `filesystem.deny` and
`allowOutside` ship empty (meaning no outside-project reach), and `deny`
patterns are checked after the allowlist and win.

## Data Model

The shipped `strict` profile (`.livestage/policy.json`):

```json
{
  "profile": "strict",
  "shell": {
    "allow": [
      "git *", "cat *", "head *", "tail *", "wc *", "grep *", "sort *",
      "uniq *", "find *", "ls", "ls *", "pwd", "which *", "echo *", "date",
      "date *", "test *", "npx vitest*", "npx jest*", "npx playwright*",
      "vitest*", "npm test*", "npm run test*", "pnpm test*",
      "pnpm run test*", "pnpm typecheck*", "pnpm lint*", "pnpm build*",
      "tsc", "tsc *", "npx tsc*", "node --test*"
    ],
    "deny": [], "requireConfirmation": false, "auditLog": true
  },
  "code": { "languages": [], "timeout": 30000, "runners": {} },
  "filesystem": { "deny": [], "allowOutside": [] }
}
```

## API/Interface

`livestage security show` prints the effective policy; `security shell test
"<cmd>"` answers ALLOWED/BLOCKED with the reason (line 429, 530).

## Business Rules

1. Every shipped profile denies all surfaces it does not explicitly grant
   (line 730-731).
2. A test proves each surface (fs-outside-project, shell, code) unreachable
   without a grant (line 731-732).
3. No policy file can defeat an immutable rule (line 732-733).
4. `deny` patterns are checked after the allowlist and win (line 428).
5. The immutable always-block list (destructive commands, inline code
   execution) is refused regardless of any allowlist (line 431-434), with the
   single named exception of the `@code` carve-out (owned by feature 29,
   Code Runners): engine-constructed runner invocations always execute a temp
   script file, never an inline `-e`/`-c` string.
6. Path traversal is checked on every file access including by the hook
   (line 434).
7. Secrets are masked before cache and before any trace record (line 435).
8. Enforcement happens post-interpolation: no interpolated value, including
   user arguments, can smuggle a command, path, host, or query past policy
   (line 100-102, 444-445).

## Acceptance Criteria

- [x] Security matrix: every surface x granted/denied x immutable-override
      attempt x hostile interpolated argument, one policy file plus one
      invocation per case, all resolve to the correct ALLOWED/BLOCKED.
      Covered by `tests/unit/engine/allowed.test.ts` (shell, 18 cases),
      `tests/unit/engine/security-filesystem.test.ts` (fs, 39 cases),
      `tests/unit/engine/template-security.test.ts` (interpolation, 5 cases),
      plus a live check: an installed `.livestage/policy.json` that
      explicitly allowlists `rm -rf *` is still blocked by the immutable
      rule, not the allowlist.
- [x] A policy edit takes effect on the very next invocation (no caching
      across invocations). Verified live: writing a fresh
      `.livestage/policy.json` is picked up by the immediately following
      `render` call with no restart; `tests/unit/engine/security-config.test.ts`
      covers reload behavior.
- [x] `security shell test "<cmd>"` reports the correct verdict and reason
      for at least one allowed and one denied fixture command. Verified live:
      `security shell test "git status"` -> ALLOWED, `security shell test
      "curl evil.com"` -> BLOCKED [not_allowed].
- [x] A fixture policy that tries to allowlist `rm -rf` or `node -e` is still
      blocked (immutable rules win). Verified live with an installed policy
      allowlisting `rm -rf *`: still blocked as `always_block`.

## Dependencies

None.

## Known Issues

None.
