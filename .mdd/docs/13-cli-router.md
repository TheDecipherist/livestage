---
id: 13-cli-router
title: CLI Router
type: COMPONENT
path: CLI / Router
source_files: [src/cli/index.ts]
status: planned
phase: idle
last_synced: 2026-08-01
initiative: livestage
wave: livestage-wave-1
depends_on: [07-package-skeleton]
tags: [cli, verb-router, exit-codes, flat-verbs, namespaces]
known_issues: []
---

# CLI Router

## What to Build

`[new; donor cli.ts]`, copy from
`~/projects/markdownai/packages/core/src/*` (cli.ts as the base). Flat
workflow verbs (`render`, `strip`, `validate`, `assert`, `eval`, `doctor`,
`init`, `watch`) plus namespaced subsystem verbs (`parser ...`, `engine ...`,
`renderer ...`, `security ...`). Exit codes are part of the contract, not an
implementation detail.

## Architecture

The single entry point that both the terminal and the PreToolUse hook call
through (boundary lint, feature 08, enforces this). Individual verb
implementations (render, doctor, init, ...) are owned by the COMPONENTs that
implement them (feature 17 for sources' contribution to render, feature 30
for doctor, feature 31 for init, etc.); this feature owns only the router
skeleton, argument parsing, and exit-code plumbing.

## Implementation Notes

Donor `build` is not a verb; `render --out` subsumes it (line 530). `security`
command family is copied from
`packages/core/src/cli-register-security.ts` + `commands/security.ts`, with
http subcommands dropped along with the retired `@http` surface (line 528).
`watch`/`--env` loading is copied from `commands/watch.ts` + `env-loader.ts`
(line 172, 530).

## Data Model

N/A.

## API/Interface

| Command | Exit 0 | Exit 1 | Exit 2 |
|---|---|---|---|
| `render <file> [--args] [--var]... [--env <file>] [--out] [--timeout] [--deterministic]` | rendered | render/policy error | usage/parse error |
| `strip <file> -o <file.md>` | written | error | usage |
| `validate <file\|glob>` | all valid | any invalid | usage |
| `assert <file\|glob>` | all assertions pass | any fail | document invalid |
| `eval '<expr>'` | value printed | eval error | usage |
| `doctor [--json] [--rules-for <file>]` | healthy | named failures | usage |
| `init` | installed (or already) | rolled-back failure | usage |
| `watch <file> [--out]` | runs until interrupted, re-renders on change | render error printed, keeps watching | usage |
| `parser ast\|check\|directives\|imports\|macros` | per subcommand | error | usage |
| `engine eval\|trace`, `renderer preview --format`, `cache clear\|status` | per subcommand | error | usage |
| `security show\|init\|disable\|shell enable\|add\|remove\|list\|test <cmd>` | per subcommand | error | usage |

## Business Rules

1. Exit codes are part of the contract: every verb's 0/1/2 meaning is fixed
   by the table above (line 513-514, 516-528).
2. `--env <file>` loads a dotenv file for `@env` via the seeded env-loader
   (line 530).
3. `security shell test <cmd>` is the policy-debugging front door (line 530).
4. `doctor` checks binary version, hooks registered + executable, every
   project `.stage` parses, policy loads with per-surface grant state, trace
   path writable, assertion-liveness summary, schema files valid; one line
   when healthy, `--json` emits machine-readable health with no blessed
   consumer; `--rules-for <file>` lists assertion documents whose targets
   match the file, their pass state, and coverage (line 532-537, owned by
   feature 30).

## Acceptance Criteria

- [ ] Every verb in the table above routes to its implementation and returns
      the documented exit code for a success and a failure fixture.
- [ ] `--env <file>` correctly loads dotenv values that `@env` then reads.
- [ ] Namespaced verbs (`parser`, `engine`, `renderer`, `security`) each
      dispatch to their subcommands correctly.

## Dependencies

07-package-skeleton.

## Known Issues

None.
