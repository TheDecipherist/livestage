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
`WAITING ON YOU` block with numbered options, never an open-ended stop. End with a
DONE block: features built, tests green, demo-state, next action.
Status bar mirror: alongside each step line run
`node .claude/hooks/lib/statusbar.cjs set wave <N> 4 "<label>"`; during PE3 update it
per feature (`set wave 3 4 "Feature K/T: <slug>"`). On completion `done wave`, on
abort `clear`.

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
Ask: automated (data-flow and plan shown but not gated, green gate runs silently, pause
only on a 5-iteration or integration failure) or interactive (full build gates on every
feature). Create `.mdd/jobs/wave-<wave>/MANIFEST.md` listing every feature in build
order with the chosen mode recorded, before anything proceeds. Features already complete
in the wave doc start `[x]`.

## PE3, execute features
Say: `[wave 3/4] Building T features in dependency order.`
For each feature in dependency order, skipping complete ones: mark it `[~]` in the
manifest, flip its `wave_status: active` in the wave doc, then ACTUALLY BUILD it. Marking a
feature does not build it: the manifest and status flips are bookkeeping around the
build, never a substitute for it. To build it, read `.claude/skills/build/SKILL.md` and
execute that build flow (Phases 1 to 7) at the chosen level for this feature. The feature
doc already exists from planning, so Phase 3 confirms it rather than rewriting, but Phases
4 to 7 run in full: failing tests and the Red Gate, the block plan, implement to the
Green Gate (this is where the code listed in `source_files` is actually written to disk),
then verify against the real runtime. A COMPONENT that finishes the flow with no new code
on disk was NOT built, do not mark it complete. A SPEC implements nothing (empty
`source_files`), so it has no code phase: confirm its contract is referenced by the
COMPONENTs that depend on it, then mark it done. Then the PE3 completion gate, a hard gate before
`[x]`: every `source_files` path exists on disk (else `[!]` and implement or document the
gap), every `satisfies_contracts` entry is wired not pending (find the call site, verify,
set verified_at), and the doc `status: complete`/`phase: all`/`last_synced` is actually
written. Mark `[x]` (or `[!]` with a note), then offer to continue or pause.

## PE4, wave completion
Say: `[wave 4/4] Wave complete, cascading status and rebuilding the brief.`
When all features are complete: set the manifest status COMPLETE, show the demo-state and
ask the user to confirm they verified it, then flip the wave `status: complete` in both
the wave doc and the initiative's Waves table. Cascade: for every feature in the wave,
write `status: complete`, `last_synced`, current `mdd_version` on any doc not already
complete or deprecated, this is the authoritative completion signal regardless of whether
Phase 7 ran cleanly per feature. Recompute both hashes. If all waves are complete, offer
to mark the initiative complete. Rebuild `.mdd/.startup.md` and delete the job folder.
(Connections regenerate on their own via the connections-sync hook as each doc is
written, no manual rebuild.)
