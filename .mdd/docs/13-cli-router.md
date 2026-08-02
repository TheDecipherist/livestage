---
id: 13-cli-router
title: CLI Router
type: COMPONENT
path: CLI / Router
source_files: [src/cli/cli.ts, src/cli/index.ts, src/cli/commands/parse.ts,
  src/cli/commands/renderer-preview.ts, src/cli/commands/render.ts, src/engine/engine.ts,
  src/engine/context.ts]
status: complete
phase: all
last_synced: 2026-08-02
initiative: livestage
wave: livestage-wave-1
depends_on: [07-package-skeleton]
tags: [cli, verb-router, exit-codes, flat-verbs, namespaces]
known_issues:
  - "The doc's source_files listed only index.ts (the library barrel export); cli.ts (the actual bin entry and router, program.command(...) registrations) is the real router and is added above."
  - "Namespace restructuring done for what exists today: parser ast|directives|imports|macros (was flat parse/list-macros/list-imports; parser directives is new, lists the registry). engine trace already existed (feature 12). security and cache namespaces already existed."
  - "RESOLVED (post-initiative known_issues sweep, task 32, 2026-08-02): parser check is a new command (src/cli/commands/parse.ts's runParseCheck) scoped narrowly to grammar validity, parse() succeeds or it doesn't, distinct from validate's broader macro/include/code-grant/assert-liveness checks layered on top of a successful parse. engine eval resolved the ambiguity by aliasing: both the flat eval and the namespaced engine eval verbs call the exact same runEval, registered via one shared registerEval() helper in cli.ts, so there is exactly one implementation, reachable two ways, consistent with engine's other subcommand (trace) and with security's flat/namespaced overlap. renderer preview --format is new (src/cli/commands/renderer-preview.ts): runs one of the nine @render formats (feature 20) standalone against raw data from a file or stdin, so `--columns`/`--option k=v` can be spot-checked without writing a full document. All three live-verified against both build targets (tsc dist/cli/cli.js and the esbuild dist/livestage.js bundle) and covered by tests/unit/cli/missing-verbs.test.ts. watch's exit-code contract is unaffected by this fix and remains spot-checked manually, not automated (a long-running process is not practical to assert against without a dedicated harness)."
  - "assert (flagged here as deferred to feature 26) was built and registered in wave 3, feature 28 (CI Mode): assert <file|glob>, plus glob support added to validate."
  - "RESOLVED (2026-08-02): doctor flat verb landed in wave 4 (feature 30), and --deterministic on render landed in wave 5 (feature 35); both were still listed as deferred here, another instance of a doc never being revisited once its cited dependency actually shipped. --timeout on render was resolved in the same post-initiative sweep as the entry above: a wall-clock deadline (EngineContext.deadline) checked once per node in walkNode, the single choke point every top-level node, foreach iteration, and nested @include walk passes through, so a runaway loop is caught without threading a check through each call site. Cooperative, not preemptive, a single long-running node still needs its own timeout (execSync/spawnSync already carry theirs); this only stops the NEXT node from starting once the deadline has passed. The acceptance criteria and API table below are corrected to match."
  - "cache's subcommand is named show, not status as the doc's table has it (cache show|clear, pre-existing from Wave 0, not renamed since it already has test coverage under that name)."
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

- [x] Every verb in the table above routes to its implementation and returns
      the documented exit code for a success and a failure fixture. Verified
      live (spawning the real built binary, not just library calls) for
      `render`, `validate`, `eval`, `strip`, `watch` (existence + argument
      only), `init`, `security`, `parser ast|check|directives|imports|macros`,
      `engine eval|trace`, `renderer preview`, `cache`, `assert` (feature 28,
      wave 3), `doctor` (feature 30, wave 4): `tests/unit/cli/cli-router.test.ts`,
      `tests/unit/cli/assert.test.ts`, `tests/unit/cli/doctor.test.ts`,
      `tests/unit/cli/missing-verbs.test.ts` (post-initiative sweep, task 32).
      `render --timeout` also live-verified for both the pass-through and
      the mid-render-abort cases; see the frontmatter known_issues.
- [x] `--env <file>` correctly loads dotenv values that `@env` then reads.
      Pre-existing, covered by `tests/unit/cli/cli-validate.test.ts`'s
      `loadEnvFile` tests.
- [x] Namespaced verbs (`parser`, `engine`, `renderer`, `security`) each
      dispatch to their subcommands correctly, including `renderer preview`
      (new) and `engine eval` (new, aliases the same `runEval` the flat
      `eval` verb calls, see frontmatter known_issues).

## Dependencies

07-package-skeleton.

## Known Issues

See the frontmatter `known_issues` above: RESOLVED. `assert`/`doctor`/
`--deterministic`/`parser check`/`engine eval`/`renderer preview --format`/
`render --timeout` are all now shipped and live-verified. The only remaining
gap is `watch`'s exit-code contract, which stays manually spot-checked
rather than automated (a long-running process is not practical to assert
against without a dedicated harness).
