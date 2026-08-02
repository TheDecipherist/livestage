---
name: build
description: Document and build a feature the MDD way. Analyze in parallel, trace data flow, write the feature doc, generate failing tests, plan in blocks, implement to green, verify against the real runtime. Invoke with /build followed by the feature description.
disable-model-invocation: true
user-invocable: true
argument-hint: "[feature description]"
arguments: [feature]
---

Run `node .claude/hooks/lib/mdd-ensure.cjs` first, before anything else. It creates `.mdd` and its essential files if missing, and is a silent no-op otherwise.

Build the feature: $feature

The feature doc is the source of truth. Everything after Phase 3 is generated FROM
it, so the doc must be complete and accurate before any code is written.

You own `.mdd/.state.json` for this run. Write the phase at every transition, the
enforcement hooks read it. Seven phases, four gates (Data Flow, Red, Green,
Integration). Never skip a gate. The Branch Guard hook blocks edits on main, and the
Test Freeze hook blocks test edits once phase is `implement`, so those are enforced,
not optional. Ownership default: my code is wrong until proven otherwise.

## Messaging protocol (user-facing)

The status lines are the user's window into this build. At the START of every phase
print exactly one plain line, `[build N/7] <what is happening>`, then work silently
(no narration of individual commands). When dispatching agents, the line says how
many and what for, and one line reports the headline result when they return, e.g.
`[build 1/7] Explored: lands in packages/api, 2 related features, 4 rules apply.`
Every gate reports its result on one line: `[build] GATE PASSED, Red Gate: 14/14 new
tests fail as required.` Whenever input is required, print a block starting
`[build] WAITING ON YOU, <gate or decision>` followed by numbered options, and stop
there; never an open-ended stop and never a question buried in prose. On completion
print a short DONE block: doc path, files written, test counts, gates passed,
integration result, next action. If blocked: `[build] BLOCKED, <reason>`, the
evidence, and numbered options.

Status bar mirror: alongside EVERY phase `Say:` line also run
`node .claude/hooks/lib/statusbar.cjs set build <N> 7 "<phase label>"` (pre-approved,
best-effort, silent), so the status bar tracks the build live. On completion run
`node .claude/hooks/lib/statusbar.cjs done build`; on abort or handoff run
`node .claude/hooks/lib/statusbar.cjs clear`.

## Phase 0, branch fit

Say: `[build 0/7] Checking branch fit.`
The hook already blocks main. What it cannot judge is feature-to-branch fit, and MDD
is one feature per branch. If you are on a feature branch, derive a slug from
`$feature`, strip the branch prefix, and compare. If they share fewer than half their
significant words, it is a mismatch: ask the user to (a) commit, merge this branch to
main, and branch fresh (recommended), (b) continue here anyway, or (c) abort. Do not
mix unrelated features on one branch. Skip this check on an audit branch
(`fix/mdd-audit-*`). Set `feature` and `branch` in `.state.json`.

## Phase 1, understand (parallel)

Say: `[build 1/7] Exploring in parallel (3 agents: codebase, features, rules).`
Dispatch the three explore agents in ONE message, in parallel:
- `mdd-explore-codebase`: structure, stack, where this feature lands.
- `mdd-explore-features`: existing docs, ids, statuses, depends_on chains, anything related. Return task docs (`type: task`) separately, they are never valid dependency targets.
- `mdd-explore-rules`: the rules and quality gates that apply.

After all three return, report the doc-coverage ratio on one line: `[build] N
source files, M feature docs.` A mature codebase with zero docs means every
prior build either never finished or never documented; say so and suggest
/reverse-engineer for the existing surface before piling new undocumented work
on top. Then two checks before questioning the user:
- Task-type detection: if `src/` has few source files AND `$feature` reads like tooling (workflow, command, config, docs, hook, script), mark it a tooling task and skip the database and API questions below.
- Shared-utilities dedup: for each related feature with `depends_on`, scan its `source_files` and `test_files` for shared infra (error types, DB client, utilities, and shared test helpers like the DB mock, auth-token, and request builders) the new feature would duplicate. If found, surface it first ("feature NN already has X in Y, extract to a shared module?") and add an extraction step to the plan if agreed. Catch duplication here, before the doc, not at Phase 6.

Then ask the user, all questions upfront in one interaction:
- Always: does this depend on any existing features (feature docs only)? Any known edge cases or error scenarios?
- Non-tooling: does it need database storage (what data)? Does it have API endpoints (what operations)?
- If relevant: auth, real-time/WebSocket, background jobs, external services.
Wait for all answers.

## Phase 2, data flow and impact (the gate)

Say: `[build 2/7] Tracing data flow and impact.`
Skip only on true greenfield (no existing docs AND under ~5 source files), noting it.
Otherwise, from the Phase 1 answers read only the files this feature will touch, not
the whole tree.

- Trace every data value the feature consumes, transforms, or displays: backend origin (file:line, the logic), API transport (exact response shape and type), frontend consumption (any transformation), and whether the same concept is computed elsewhere with different logic.
- LSP preconditions first: if the project's typecheck script declares a codegen step (framework typegen, generated clients), run it before any LSP lookup, or references resolve against nothing and the trace silently under-reports. If the language server itself is unavailable (the readiness hook reports it), the trace runs DEGRADED on grep: say so in the gate output and in the doc's known_issues, never report a degraded trace as a full one.
- Impact: for each endpoint or function the feature modifies, find every call site with LSP `findReferences` (exact callers, no false hits from comments or a same-named symbol, and it catches aliased imports and re-exports that `grep` misses). Fall back to `grep -rn` only when no language server covers the file type. Every consumer listed may break silently after the change.
- Write findings to `.mdd/audits/flow-<slug>-<date>.md` as you go, not into memory. `data_flow` frontmatter points here.
- Gate: present the values, any consistency issues found, and the impact list. Ask "proceed with documentation, adjust scope, or stop." Mandatory, do not proceed unconfirmed. If consistency issues exist, decide with the user whether to fix them here or record them as known issues first.

Set `phase: document`.

## Phase 3, write the doc

Say: `[build 3/7] Writing the feature doc.`
Read `.mdd/00-frontmatter-spec.md` first, it is the authoritative schema. Auto-number:
highest existing id in `.mdd/docs/` (excluding archive) plus one.

Populate the frontmatter fact-fields with parallel discovery: fan out one
`mdd-frontmatter-discovery` agent per field (`source_files`, `routes`, `models`,
`depends_on`, `test_files`) in one dispatch, each returns a verified list, assemble
from those. Author the synthesis-fields yourself: `title`, `data_flow` (the flow doc
path), `tags` (4 to 8 domain concepts, never file paths), and `path`. Write every
required schema field with a valid value: `id` (auto-numbered), `title`, `type`
(COMPONENT, or SPEC for a pure contract whose `source_files` is empty), `path`,
`source_files`, `status` (`active` while building), `phase` (`document` here),
`last_synced` (today), plus `initiative`/`wave` if this build belongs to one. The
frontmatter-validate hook BLOCKS any doc that violates `.mdd/00-frontmatter-spec.md`
(a missing field, a bad `status`/`phase` enum, a SPEC with `source_files`, an
unsatisfied contract), so write them all correctly on the first write, not after a block.

Write the doc body with these sections: Purpose, Architecture, Data Model, API
Endpoints, Business Rules, Data Flow, Dependencies, Security, Known Issues (empty on a
new feature). Determine `path` by reading existing docs' `path` values for the
product's established vocabulary, then place this feature where a user would navigate
to reach it (1 to 3 Title-Case segments, siblings spelled identically); ask if
genuinely ambiguous.

Phase 3a, integration contracts (mandatory when `depends_on` is non-empty). For each
dependency, read its doc, check its `integration_contracts`, and for each that applies
add a `satisfies_contracts` placeholder (`from`, `function`, `when`, `status: pending`,
`verified_at: ""`). Any dependency tagged security/auth/masking/filesystem, or that
provides a "check before X" function, is mandatory. Leaving `satisfies_contracts`
empty when a dependency has mandatory contracts is a build error, do not proceed past
3a. And the declaring side: if THIS feature provides a security-critical gate function
(identifier resolution, an auth or permission check, input validation, masking, any
"check before X" that other features must call), declare it with an
`integration_contracts` entry (`function`, `when` or `always`, `mandatory: true`) so
every COMPONENT that depends on this one is held to it by the frontmatter-validate
hook's reciprocity check. Declare on the provider COMPONENT, never on a SPEC.

Phase 3b, invariants that hold regardless of the doc: anything the spec calls
"immutable" or "cannot be overridden" needs `readonly`/`as const` typing AND
`Object.freeze()`, a plain const is not enough. Anything exposing functions to MCP,
CLI, or external callers needs a Security section naming untrusted inputs, what a
malicious caller could send, required sanitization, and what it must never expose.
Project-specific invariants come from the applicable rules, apply them too.

Rebuild `.mdd/.startup.md` (via /status logic), present the doc, and ask "does
this describe what you want to build?" Wait for confirmation before any code.

## Phase 4, test skeletons, then the Red Gate

Say: `[build 4/7] Writing failing test skeletons.`
Set `.state.json` `test_files` to the doc's `test_files`, then `phase: red`. Before writing any test file, ensure the project's shared test helpers exist: import an existing `tests/helpers/` module, or create one from the test-writer skill's `templates/test-helpers.template.ts`, and import it, never re-inline the DB mock, token setup, env vars, or request builders. Start route tests from the `route-test.template.ts` scaffold. Also regenerate the rule-conformance suite: `node .claude/hooks/lib/conformance-gen.cjs` writes `tests/conformance/` from the rules' `conformance:` blocks (deterministic, near-zero tokens). Those assert project-wide rule invariants, are not feature skeletons, and are exempt from the Red Gate below (they may already pass), but are run by the full suite and must be green by Phase 7. From the
doc's endpoints, rules, and edge cases, write skeletons: one describe per endpoint or
rule, one test per documented behavior (happy path plus each error case), each a
placeholder that fails (`expect.fail('MDD skeleton')`), with the exact response shapes
and status codes from the doc. If both unit and E2E are needed, dispatch two
`test-writer` agents in parallel (different files, no conflict).

For every `satisfies_contracts` entry whose `when` is not `always`, also write a
dedicated skeleton that asserts the contract holds specifically under that condition
(name it for the condition, e.g. `lookup carries tenant scope`). A when-conditioned
contract with no condition-specific test is not covered.

Red Gate, mandatory, no skip: run only the new test files. Every one MUST fail. If one
passes, either the assertion is empty (fix the assertion, never delete it), the
behavior already exists (retarget the test and note the overlap in `known_issues`), or
there is a syntax error (fix it). Block until all confirmed red.

## Phase 5, plan in blocks

Say: `[build 5/7] Planning implementation blocks.`
Auto-detect size: simple (under 3 new files, no routes, no DB) uses flat named steps.
Medium or large uses blocks. A block has a runnable end-state (compiles, tests pass, no
half-open interfaces), a commit-worthy scope (one conventional-commit reason), its own
verify command, and a handoff (what the next block expects).

Sequence blocks by dependency layer: Layer 1 types and shared interfaces, Layer 2
services/components/handlers, Layer 3 route wiring and integration, Layer 4 test
implementation. A block may run as parallel agents only if two gates pass: the
file-declaration gate (list every file each agent writes, any overlap forces
sequential) and the type-dependency gate (a block creating types another imports must
run first). Present the plan with every block named, and wait for confirmation.

Set `phase: implement`. Test Freeze is now active on `test_files`.

## Phase 6, implement to the Green Gate

Say: `[build 6/7] Implementing block 1 of N: <name>.` (repeat the line per block)
Execute blocks in layer order. Within a layer, parallel-marked blocks run together
(re-verify the file-declaration gate first, each agent prompt fully self-contained with
the doc and the Layer 1 type contents embedded, not referenced); sequential blocks run
one at a time. Ripple rule: if a block changes a directive, canonical string, or config
key other code consumes, `grep -rn` the old string across the repo and update every
consumer in the same block. This one stays `grep`, not LSP, on purpose: these are
string and config consumers, not symbols a language server can resolve, so
`findReferences` is blind to them.

Green Gate loop per block, `gate: green-pending`: run the feature's tests and
typecheck. If failing, diagnose first (exact error, which assumption was wrong, the one
targeted fix), then fix the implementation only, never the test (if a test looks wrong,
re-read the doc; if the doc looks wrong, stop and ask). One line per iteration. Stop at
five iterations and present options (keep debugging, narrow scope, review together),
never a sixth. After a block goes green, run the full suite: any regression counts
against that block's remaining budget. On all green, `gate: passed`.

## Phase 7, verify and report

Say: `[build 7/7] Verifying: quality gates, real-runtime integration, review agents.`
Set `phase: verify`. Quality gates first: typecheck and the full test suite must pass,
and enforce the size gate hard here (no file over the size limit, default 300 lines, `MDD_MAX_FILE_LINES` to override per project; no function over 50). The limit is not the point: an oversized file whose bulk is pure functions gets those functions extracted BECAUSE they are the testable part, whatever the line count says.

Integration verification, by feature type from the frontmatter, quality gates passing
is not the feature working:
- Backend: start the server, run the real happy-path request (real HTTP, real DB, not mocked), watch logs, verify response shape and status match the doc, confirm DB state changed with a direct query, test one documented error case.
- Frontend: open the page, verify the expected data is visible (not just "it loaded"), click through the flow, confirm the network calls and responses, check the console is clean, test an error state.
- Database: verify writes with a direct query (not the insert return), verify read shapes, confirm invalid data errors rather than failing silently, EXPLAIN the primary queries for scans.
- Tooling: run against a real scenario, verify output matches the doc exactly, test each documented error case, confirm no unintended side effects.
- Spec invariants: for any "cannot be overridden"/"always blocked"/"required" language, verify it is actually enforced in code and asserted in a test, and that a module the spec says enforces X is actually called at the call site, and every when-conditioned contract seam (for example a scope that must hold across a join) has a structural or suite assertion, not just prose.

Ownership default applies throughout: any external failure (API down, key unset, slow
service) is a hypothesis until disproven. Read the logs, run a minimal probe, form a
falsifiable cause before accepting any external blocker.

Service baseline, before the reviewers, for any feature whose doc has a non-empty
`routes` field. Reviewers read diffs, and an ABSENCE (missing CSP, missing timeout,
missing detection) appears in no diff, so this is a checklist evaluated against the
WHOLE service, not the change:
- Security headers set (CSP for HTML apps); error shape returns a correlation id,
  never `err.message` (http-security rule).
- Every request-path query has a timeout; the request has a deadline; note the
  fan-out count of one representative request end to end.
- Rate limiter, if present, passes the four-point correctness check in the
  http-security rule (trust proxy, key source, store scope, growth bound).
- Rejections (429, repeated 400, auth failures) are observable; every
  log-once-and-suppress path exposes a counter (logging rule).
- Route inventory: every route, reachable unauthenticated or not, what it returns,
  and WHY it exists (sourced from the README or docs, so deliberate endpoints are
  not re-litigated every audit). Any path where unauthenticated input becomes
  durable state rendered to others is flagged as a decision.
- Untested-file listing: source files in the feature's directories with no
  corresponding test file at all (no coverage tool needed, just the list).

Then dispatch the review agents for the diff in ONE message as foreground parallel
subagents: `code-reviewer` always, `security-reviewer` ALWAYS when the doc's
`routes` field is non-empty (never "if warranted", absences and auth are exactly
what judgment skips), plus `silent-failure-hunter`, `pr-test-analyzer`, and
`performance-reviewer` if warranted. Run them foreground so they all
return their findings together in this turn. Do NOT background them: Phase 7 cannot
complete until the findings are in hand, and backgrounding drops the build into an async
wait/poll path that stalls it. Address the high-confidence findings.
`pr-test-analyzer` answers what the Red Gate cannot: would any test go red if the
implementation were wrong.

Completion, if integration verified:
- Contract gate: every `satisfies_contracts` entry must be `status: done`. For each, list every call site of the function with LSP `findReferences`; if the language server is unavailable, the gate must SAY it ran degraded on grep and record that in the doc, a degraded gate never reports itself as fully passed (`grep` under-matches here, an aliased import or a re-export hides a real caller, and a missed caller is a contract falsely marked satisfied), fall back to `grep -rn` only when no language server covers the file type. Every call site must invoke it (a contract wired in one layer but not another is not satisfied), set `verified_at` to the confirmed call site as a `path.ext:line` locator, never a date. For every entry whose `when` is a specific condition (not `always`), confirm a test exercises that exact condition and is in the running suite; a when-conditioned contract with no condition-specific test does NOT count as satisfied and blocks completion. A pending contract blocks completion. Confirm every `source_files` entry exists on disk.
- Set the doc `status: complete`, `phase: all`, `last_synced: today`. (Writing the doc regenerates `.mdd/connections.md` on its own, the connections-sync hook owns the map, no manual rebuild.)
- Clear `.state.json` to `{ "phase": "idle", "gate": "none" }`, and if any lesson from this build qualifies (prevents a repeat mistake, not derivable from code, durable, not already covered), route it: a file-typed lesson to a path rule, a checkable one to a hook, else a CLAUDE.md line.
- Report: doc, flow doc, files, blocks, tests, integration result, and the branch, then offer to commit and merge to main (stage, conventional commit, merge --no-ff, ask before push).

If integration is blocked by an external condition: set `status: in_progress`,
`phase: integration-pending`, `gate: integration-pending`, record the exact blocker,
the evidence, and the next step, and state the feature is not done until Phase 7 passes.
Code complete is not feature done.
