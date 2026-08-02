---
id: 31-init
title: Init
type: COMPONENT
path: CLI / Init
source_files: [src/cli/commands/init.ts]
status: planned
phase: idle
last_synced: 2026-08-01
initiative: livestage
wave: livestage-wave-4
depends_on: [10-security-policy-core, 11-extension-routing, 30-doctor]
tags: [init, install, all-or-nothing, rollback, claude-md-marker, idempotent]
known_issues: []
satisfies_contracts:
  - from: 10-security-policy-core
    function: enforcePolicy
    when: always
    status: pending
    verified_at: ""
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

`livestage init` (line 524). Flags: `--claude-md` / `--no-claude-md`
(line 484).

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

- [ ] `livestage init` on a clean project registers both hooks and seeds
      `.livestage/policy.json` with the strict profile.
- [ ] Running `init` twice is a no-op the second time (idempotence).
- [ ] A simulated failure partway through `init` rolls back all partial
      changes (settings files restored from backup).
- [ ] `--claude-md` writes a marker-delimited section into CLAUDE.md;
      `--no-claude-md` skips it; the written section contains no directive
      syntax suggested for non-`.stage` files.
- [ ] `doctor` reports healthy immediately after a successful `init`.

## Dependencies

10-security-policy-core (seeds the policy), 11-extension-routing (registers
the hook), 30-doctor (verification target for a successful install).

## Known Issues

None.
