---
name: plan-execute
description: Build every feature in a wave through the full MDD flow, tracked in a manifest that survives interruption. Validates hashes and dependencies, runs each feature through build Phases 1 to 7 at the chosen interaction level, gates completion on source files and contracts, then cascades status when the wave finishes. Invoke with /plan-execute followed by the wave slug.
disable-model-invocation: true
user-invocable: true
argument-hint: "[wave slug]"
arguments: [wave]
---

Run `node .claude/hooks/lib/mdd-ensure.cjs` first, before anything else. It creates `.mdd` and its essential files if missing, and is a silent no-op otherwise.

Execute wave: $wave

Runs the full build flow per feature, with a manifest so an interrupted wave resumes
exactly where it stopped.

Messaging: the status lines are the user's window into this run. Print exactly one
plain `[wave N/4] ...` line at the start of each step below, then work silently.
During PE3 also print one line per feature, `[wave 3/4] Feature K of T: <slug>
(building, phase N/7)`, updated as the inner build advances phases. Questions use a
`WAITING ON YOU` line, with the choices presented through the AskUserQuestion tool so the user picks with the arrow keys and enter, NEVER a typed-answer prose prompt. The recommended option is always FIRST and labeled "(Recommended)". Numbered text options are the fallback only when the tool is unavailable (headless or unattended runs). Never an open-ended stop. End with a
DONE block: features built, tests green, demo-state, next action.
Micro-status for a wave: the label always carries feature K/T plus the inner
build's live action, e.g. `set wave 3 4 "F3/7 21-cache: block 2/3
cache/store.ts"`, `set wave 3 4 "F3/7 21-cache: suite green, merging"`; during
parallel batches, the batch view: `set wave 3 4 "batch 2: 3 builders running,
1 green"`.

Task checklist shape for a wave: create it at PE1 with the four PE steps, then
after PE1 reads the wave add one entry per feature in build order; a feature's
entry goes in_progress when its build starts and checked when it passes the PE3
completion gate. The inner builds never touch the list (wrapper owns it); under
an import-spec handoff the import's list already exists, add this wave's
features to IT instead of creating one.

Status bar mirror: at PE1 run `node .claude/hooks/lib/statusbar.cjs run-start wave` ONLY when the user invoked this skill directly; under an import-spec handoff the import's run is already open and owns the timer, do not run-start. Whenever stopping for user input (any WAITING ON YOU), first run `node .claude/hooks/lib/statusbar.cjs pause` so waiting time never counts as run time; the timer resumes automatically on the next `set` after the answer. When the run completes, the freezing `done <flow>`/`run-done` call PRINTS `MDD <run> completed in <elapsed>`: repeat that line VERBATIM as the very LAST user-visible line of the run, after everything else in the DONE block, always. Task checklist, always: at run start create the session task list (TodoWrite / the native task tool) with one entry per step of this skill, named exactly like the Say lines; mark the current entry in_progress and check each one off AT the moment its step completes, so the full plan, what is done, and what is running are visible the whole run. Same ownership rule as the timer: the user-invoked wrapper creates the list; a skill executing inside another MDD flow NEVER creates or replaces it, the wrapper's list already carries that work as an entry. Micro-status: the checklist is the broad strokes; the status bar label is the LIVE one. Between Say lines, refresh it (`set <flow> <N> <T> "<msg>"`, same phase numbers) every time the concrete action changes: dispatching agents, reading a file, writing a specific file, running the suite, gate iteration K, waiting on a command. Present tense, specific, short (under ~48 chars), e.g. "writing tests/auth.test.ts", "suite run 2, 3 red", "wiring routes/session.ts". A label that sits unchanged through many actions reads as hung; the set call is near-free, refresh it liberally. Then alongside each step line run
`node .claude/hooks/lib/statusbar.cjs set wave <N> 4 "<label>"`; during PE3 update it
per feature (`set wave 3 4 "Feature K/T: <slug>"`). On completion `done wave`, on
abort `clear`, on a BLOCKED stop `run-done` (the timer freezes where the run
stopped). Timer ownership is enforced by the statusbar lib, not by discipline: one
run = one user-initiated process. A standalone wave's timer starts at PE1 and
freezes at `done wave`; the inner builds' own statusbar calls are absorbed and
never reset it; under an import-spec handoff the timer spans import plus every
wave and only the final `run-done` freezes it.

## PE1, load and validate
Say: `[wave 1/4] Validating wave, initiative, hashes, and dependencies.`
Branch guard: the hook blocks main; if on a feature branch that does not match `$wave`,
handle the mismatch like build Phase 0 (commit-merge-branch-fresh / continue / abort).
Then: require the wave slug and read the wave doc (hard stop if missing); read the parent
initiative (hard stop if missing); verify BOTH file hashes (mismatch means manual edit,
run `/plan-sync` first); depends-on gate (a prior wave must be `complete`); feature
ordering (build the intra-wave dependency graph, stop and offer auto-reorder on a
violation). Stale-job: if `.mdd/jobs/wave-<wave>/` exists, read its MANIFEST and offer
Resume (restore the recorded interaction mode, start from the first `[ ]`/`[~]`, never
re-run `[x]`) or Discard.

## PE2, interaction mode and job
Say: `[wave 2/4] Choosing interaction mode and creating the job manifest.`
Ask (skip the question when the caller already chose, e.g. import-spec's unattended
handoff): interactive (full build gates on every feature), automated (data-flow and
plan shown but not gated, green gate runs silently, pause only on a 5-iteration or
integration failure), or UNATTENDED (automated plus: no prompt at wave completion,
judgment protocol below decides the small stuff, the user has walked away). Create
`.mdd/jobs/wave-<wave>/MANIFEST.md` listing every feature in build order with the
chosen mode recorded, before anything proceeds. Features already complete in the wave
doc start `[x]`.

The branch hard rule, EVERY mode, not only unattended: at wave start, create a fresh
feature branch from an up-to-date default branch (`git checkout main && git pull
--ff-only 2>/dev/null; git checkout -b wave/<wave-slug>`); if a branch of that name
exists, suffix `-2`, `-3`. All wave work happens on it. PE4 commits and merges it back.
Never build a wave on main, and never continue a wave on a previous wave's branch.

Unattended judgment protocol. The docs were approved at import and the plan at PE1;
what remains is execution detail, so: decide-and-log for anything SMALL (a naming
choice, a file placement, a test-shape call, an ambiguous doc line with one obviously
sensible reading, a dependency version pin), writing each call to the manifest under a
`## Judgment log` heading (what came up, what was chosen, why, which doc line). STOP
as BLOCKED, statusbar included, for anything that could genuinely mess up the build:
(freeze the timer with `statusbar.cjs run-done` as part of any BLOCKED stop):
a gate that will not pass within its iteration budget, a contract violation, an
entry-surface or boundary test that cannot be made to pass, a business rule whose
scope would have to be narrowed (the silent-narrowing lesson), anything destructive
or irreversible (data deletion, force-push, dependency major-upgrades), any security
decision, missing credentials or a dead external service, or two docs that
contradict each other. The test is: would the user rather answer this question later
than have me guess now. Small means the answer is no.

## PE3, execute features

Lane plan first, before building anything: compute the wave's parallel structure
from two inputs, `depends_on` and file ownership.
- A feature is PARALLEL-ELIGIBLE when every `depends_on` entry is already
  `status: complete` (an earlier wave, or an earlier lane batch of this wave) and
  none of its `source_files`/`test_files` overlap another eligible feature's. Shared
  WIRING files (server.ts, a routes index, package.json) count as overlap, that is
  where "independent" features actually collide.
- Features that depend on same-wave siblings, or that share files, build in
  SEQUENCE, in dependency order. Early foundation waves usually serialize entirely,
  that is correct, not a failure of the plan; late waves of leaf features usually
  parallelize almost fully.
- The result is ordered batches: `batch 1: [a] then batch 2: [b, c, d] then ...`.
  Write the lane plan into the manifest. Cap parallel width at
  `MDD_PARALLEL_BUILDERS` (settings.json `env` block, default 3). The default is
  deliberately small: only Phases 4 to 6 parallelize while merge, full suite,
  Phase 7 and review stay serial per feature (the serial tail caps the speedup),
  the builders share one machine's CPU and test ports, and both failure-handling
  load and merge-conflict odds grow with width. Raise it on a big machine with a
  fast suite; the lane plan and serial merge stay correct at any width.

Sequential batches (and interactive mode, which is per-feature gated and therefore
always sequential) run exactly as below. Parallel batches, in automated and
unattended modes, run through builder agents:
- Per feature: cut its `feat/<slug>` branch from the wave branch, create a worktree
  (`git worktree add .worktrees/<slug> feat/<slug>`; `.worktrees/` is gitignored),
  then dispatch ONE `mdd-feature-builder` agent per feature, ALL in one message so
  they run concurrently, each given its worktree path, branch, feature doc, and flow
  doc. The agent runs build Phases 4 to 6 in its worktree and returns the result
  contract; the orchestrator does not build during a parallel batch, it waits.
- On results: for each GREEN feature IN LANE-PLAN ORDER, merge `--no-ff` into the
  wave branch, run the full suite on the wave branch, then run that feature's
  Phase 7 (integration verification against the real runtime plus the review-agent
  fan-out, which only the orchestrator can dispatch), then the PE3 completion gate
  and doc flips below. Serializing merge-plus-verify keeps ports, DB state, and the
  suite deterministic while the expensive part (red to green) ran in parallel.
- A merge conflict in a parallel batch means the lane plan missed an overlap: stop
  merging, rebuild the lane plan with those features serialized, and finish them
  sequentially. A BLOCKED result pauses only unattended runs if the blocker gates
  the wave; otherwise record it `[!]` and continue the batch.
- Clean up each worktree after its merge (`git worktree remove`).

Say: `[wave 3/4] Building T features: batch 1 sequential (N), batch 2 parallel (M), ...`
For each feature in dependency order, skipping complete ones: mark it `[~]` in the
manifest, flip its `wave_status: active` in the wave doc, then ACTUALLY BUILD it. Marking a
feature does not build it: the manifest and status flips are bookkeeping around the
build, never a substitute for it. To build it, read `.claude/skills/build/SKILL.md` and
execute that build flow (Phases 1 to 7) at the chosen level for this feature. The feature
doc already exists from planning, so Phase 3 confirms it rather than rewriting, with one
hard exception: "confirm, don't rewrite" NEVER means "skip what was never filled". Any
fact-field that is empty or absent on the planned doc (`test_files` is the proven case,
seeding skills cannot know it; check `source_files`/`routes`/`models`/`depends_on` the
same way) gets its discovery run for that field specifically, right here. This exact
sentence once read as permission to skip Phase 3 wholesale, and 28 of 48 docs in a real
project completed with empty `test_files` while their own prose cited the tests by name.
Then Phases
4 to 7 run in full: failing tests and the Red Gate, the block plan, implement to the
Green Gate (this is where the code listed in `source_files` is actually written to disk),
then verify against the real runtime. A COMPONENT that finishes the flow with no new code
on disk was NOT built, do not mark it complete. A SPEC implements nothing (empty
`source_files`), so it has no code phase: confirm its contract is referenced by the
COMPONENTs that depend on it, then mark it done. Then the PE3 completion gate, a hard gate before
`[x]`: every `source_files` path exists on disk (else `[!]` and implement or document the
gap), every `satisfies_contracts` entry is wired not pending (find the call site, verify,
set verified_at), `test_files` lists the test files Phases 4 to 6 ACTUALLY wrote (from
the real diff, never the planning-time guess; the validator hard-rejects a complete
COMPONENT with source files and empty test_files, and the only escape is a loud
`[deferred] no independently testable behavior: <why>` known_issues entry), and the doc
`status: complete`/`phase: all`/`last_synced` is actually written. Mark `[x]` (or `[!]` with a note), then offer to continue or pause (unattended:
continue, one progress line, no offer). Git inside a wave, per feature, done
automatically in every mode: build each feature on its own branch cut from the WAVE
branch (`feat/<feature-slug>`), and on completion commit (conventional message) and
`merge --no-ff` back into the wave branch, delete the feature branch. This is build
Phase 7's commit-and-merge kept, with one change of target: inside a wave, a feature
merges to the wave branch, never directly to main; main is touched exactly once per
wave, at PE4. A feature abandoned mid-build stays an unmerged branch, the wave
branch never carries half a feature.

## PE4, wave completion
Say: `[wave 4/4] Wave complete, cascading status and rebuilding the brief.`
When all features are complete: set the manifest status COMPLETE, then the demo-state:
interactive/automated modes show it and ask the user to confirm they verified it;
unattended RUNS it (execute the demo-state's checks against the real runtime, the
same standard as build Phase 7) and records the result in the wave report instead of
asking, a demo-state that cannot be exercised without a human (a visual check, a
device) is recorded as `deferred to human review` in the report, never fake-confirmed.
Then flip the wave `status: complete` in both
the wave doc and the initiative's Waves table. Cascade: for every feature in the wave,
write `status: complete`, `last_synced`, current `mdd_version` on any doc not already
complete or deprecated, this is the authoritative completion signal regardless of whether
Phase 7 ran cleanly per feature. Recompute both hashes. Rebuild `.mdd/.startup.md` and
delete the job folder.

The merge hard rule, EVERY mode: commit the wave's work on its branch (conventional
message naming the wave), then merge to the default branch automatically,
`git checkout main && git merge --no-ff wave/<wave-slug>`, and delete the wave
branch. No asking when the main-safety gate below is green, this pairs with the
branch rule at PE2: a wave that started on its own branch ends merged or it did
not end.

The main-safety gate, BEFORE main's ref moves, every mode. Principle: main is
never the place a problem is discovered; the exact tree main will become is built
and proven on the wave branch first.
1. Sync: if main advanced since the wave branch was cut (`git rev-list
   --count <branch-point>..main`), merge main INTO the wave branch first. Two
   green branches can still merge into one broken tree; this is where that is
   caught, not on main.
2. Conflicts in that sync: mechanical ones (lockfiles, disjoint imports,
   formatting) may be resolved and logged under the judgment protocol. Any
   conflict where BOTH sides changed the same behavior (business logic, a
   contract, a migration) is a hard STOP in every mode, including unattended:
   present both sides and ask, never guess a semantic merge.
3. Divergence stop: a clean sync and a green suite are NECESSARY, not always
   SUFFICIENT. When main's advance overlaps what the wave touched, judge whether
   the suite actually covers the interaction: main changed files in the wave's
   `source_files`/`test_files` or their shared wiring, main altered a contract,
   schema, or dependency version the wave builds on, or the sync is simply too
   large to reason about confidently (many commits across the same subsystems).
   In any of those cases STOP and ask, in every mode, even with everything
   green: show what main changed, what the wave changed, where they overlap, and
   why confidence is low. "I cannot determine this merge is safe" is itself a
   blocker, never a reason to proceed quietly. Disjoint changes (main moved in
   areas the wave never touched, suite green) proceed without asking.
4. Prove the merged tree: full test suite, typecheck, and the conformance suite
   on the wave branch WITH main integrated. Green means the subsequent merge to
   main produces the exact tree just tested (main is now an ancestor). Red means
   the merge does not happen, period: report BLOCKED with the failing output and
   ask, in every mode; an unattended run stops here rather than deliver a broken
   main.
5. Never: resolve conflicts on main itself, merge with a dirty working tree,
   `--force` anything, or skip the gate because "it was green before the sync".

Pushing to a remote is NOT part of the rule: ask in attended modes, and in
unattended leave the push to the final report (the global rule about deploys
stands).

Open-gaps rollup, mandatory at every wave close, BEFORE offering to close the
initiative: enumerate this wave's unchecked `[ ]`/`[!]` boxes and `known_issues`
entries ([deferred] vs [gap], untagged reads as [gap]) and print the list in the
completion report. Backward sweep per landed feature: grep the doc corpus for
references to each newly-completed feature's id in OTHER docs' known_issues and
stubs; anything waiting on a feature that just landed is listed as "now unblocked".
Closing a wave with documented gaps is a decision; the rollup is what keeps it one.
If all waves are complete, offer to mark the initiative complete, and the OFFER
ITSELF carries the initiative-wide open-items list (every wave's surviving gaps in
one table): the user closes the initiative looking at what stays open, never blind.
In unattended mode there is no one to offer to: mark the initiative complete when
every wave closed clean, and put the initiative-wide open-items table, the full
judgment log, every wave's demo-state result, and the branches merged into ONE
final run report, that report is what the user comes back to.
(Connections regenerate on their own via the connections-sync hook as each doc is
written, no manual rebuild.)
