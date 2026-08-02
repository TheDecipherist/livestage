---
name: audit
description: Audit code against its feature docs by sharding files across parallel agents with a manifest that survives compaction, plus specialist review passes, then merge into one deduplicated confidence-ranked report and optionally fix. Invoke with /audit, optionally scoped to a section or feature id.
disable-model-invocation: true
user-invocable: true
context: fork
argument-hint: "[scope: section, feature id, staged, or a PR]"
arguments: [scope]
---

Run `node .claude/hooks/lib/mdd-ensure.cjs` first, before anything else. It creates `.mdd` and its essential files if missing, and is a silent no-op otherwise.

Audit: $scope

Messaging: this skill runs forked, so the status lines are the user's ONLY window.
Print exactly one plain `[audit N/8] ...` line at the start of each step, then work
silently. While shards run (A3/A4), re-print the line whenever the done-count moves
by about 10 percent or a shard finishes: `[audit 4/8] 5 shards running, 42/117 files
done.` Questions use a `WAITING ON YOU` block with numbered options. End with a DONE
block: totals by severity, top issues, report path, next action.
Status bar mirror: alongside each step line run
`node .claude/hooks/lib/statusbar.cjs set audit <N> 8 "<label>"`; during A3/A4 refresh
it with the file progress (`set audit 4 8 "42/117 files"`). On completion `done
audit`, on abort `clear`.

Runs forked so the reading never bloats the main thread. Disk is memory throughout, so
a large audit survives compaction: the manifest and the per-agent notes are the state,
the analysis does not need to survive a context clear. Two engines run together, shard
agents for breadth (walk many files) and review agents for depth (specialist passes).

## A1, scope

Say: `[audit 1/8] Resolving scope and running doc cross-checks.`
Open with the coverage ratio, before anything else: count source files in scope and
feature docs in `.mdd/docs/`, and print `[audit] N source files, M feature docs.`
If M is zero, say plainly that the audit has no documented contracts to compare
against and offer /reverse-engineer or /import-spec first rather than auditing into
a vacuum; continue only if the user says so.
Stale-job check first. Look in `.mdd/jobs/` for an existing `audit-*/` folder. If one
exists with a matching `audits/report-<date>.md`, cleanup failed, delete the stale
folder and proceed. If one exists with no report, it was interrupted: read its
`MANIFEST.md`, report done/total, and offer Resume (reuse the folder, pick up from the
first `[ ]`, never re-process `[x]`/`[!]`/`[e]`) or Discard.

Resolve scope to a deduplicated file list: read every `.mdd/docs/*.md` to build the
feature map and resolve every `source_files` entry, plus `.mdd/ops/*.md` (check for
missing sections, literal credentials, stale `last_synced`). A section or feature id
narrows to that feature's files; `staged` is `git diff --cached --name-only`; a PR is
`gh pr diff`. If no `.mdd/` exists, offer to scan-and-document or exit.

Main-thread doc cross-checks (these compare docs to each other and to disk, per-file
agents cannot do them). Write results to `.mdd/audits/doc-findings-<date>.md`:
- Every `source_files` path exists on disk (missing = P2).
- A feature with `depends_on` on a feature that has `integration_contracts` must have non-empty `satisfies_contracts` (missing = P2).
- Every `satisfies_contracts` entry with `status: pending` = P1 (documented, never wired).
- For satisfied contracts, EVERY source file performing the contracted operation has the guard call, not just one (unguarded file = P2, or P1 if a security contract).
- Every `security_read_sites` entry: read that file:line and confirm the surrounding code calls the canonical confinement function (no call = P1).
- Every `integration_contracts` caller_feature exists as a doc (missing = P3).
- Prose-only obligation scan (leading indicator of seam risk): for every SPEC doc, scan its Business Rules and invariant prose for named gate functions (an identifier immediately followed by `(`, or imperative phrases like "must call", "check before", "always X before"). For each named gate, confirm some COMPONENT declares a matching `integration_contracts` entry and some dependent carries the `satisfies_contracts` pair. A named obligation with no `integration_contracts` / `satisfies_contracts` pair is carried by prose only: flag P2 and keep a running count.

Incremental vs full when a prior audit exists: full regenerates from all files;
incremental uses `git diff --name-only <last-audit-commit>` plus untracked files (not
mtime). Store HEAD in the job folder for the next incremental.

Agent scaling by file count: under 10 -> 1 (single-feature mode below), 10 to 25 -> 2,
26 to 50 -> 3, 51 to 100 -> 5, 100+ -> 8 (ceiling, override `MDD_MAX_AGENTS`). Shard by
estimated token load (file size), not raw count, so shards are balanced. Create
`.mdd/jobs/audit-<date>/` and write `MANIFEST.md` (a per-shard checklist, states
`[ ]` pending, `[~]` in progress, `[x]` done, `[!]` findings, `[e]` error) before
anything else proceeds.

## A2, per-agent config

Say: `[audit 2/8] Sharding N files across M agents.`
Before spawning, main writes into the job folder, for each agent: `shard-N.md` (its
flat file list), and once for all, `integration-context.md` (the feature-to-source-file
map plus every integration contract and who must satisfy it, or "no contracts" if none,
always created). Each shard agent gets only the path to its config. The audit criteria
and the per-file loop live in the `mdd-audit-shard` agent.

## A3, parallel execution

Say: `[audit 3/8] Dispatching M shard agents plus the review passes.`
Dispatch all shard agents at once, plus the review agents the diff warrants (read the
diff, not just paths): `code-reviewer` always; `silent-failure-hunter` on error
handling; `pr-test-analyzer` when tests or behavior changed; `security-reviewer` on
auth/input/queries/tokens; `performance-reviewer` on endpoints/queries/loops;
`doc-reviewer` on docs. Each shard agent runs its per-file loop (mark `[~]`, read,
analyze against the criteria, append findings plus a mandatory `Contracts:` line to its
own notes, mark `[x]`/`[!]`, clear context, resume from the manifest). While they run,
main reads the manifest and prior notes to enrich the merge, never idle.

## A4, convergence

Say: `[audit 4/8] Converging: verifying every file was processed.`
When agents signal done, read `MANIFEST.md`. Any `[ ]` means an agent never reached it,
re-run that shard's remainder. Any `[~]` means a clear between marks, re-process that
file. Any `[e]`, main tries to read it itself. Do not advance until every file is
`[x]`, `[!]`, or `[e]`.

## A5, merge (synthesis protocol)

Say: `[audit 5/8] Merging and deduplicating findings.`
Merge notes in manifest order into `audits/notes-<date>.md`, append the doc-findings as
a `Feature Doc Issues` section, verify the entry count matches. Then apply the synthesis
protocol across shard and review findings: deduplicate overlaps and attribute to the
most specific evidence; confidence buckets (90 to 100 act, 80 to 89 Consider, below 80
drop); deconflict by domain (security over code on input, performance over code on hot
paths, silent-failure over code on error handling), never two conflicting fixes without
saying which.

## A6, analyze

Say: `[audit 6/8] Writing the report and verifying contracts.`
From the notes (not the code again, except the contract step) produce
`audits/report-<date>.md`: executive summary (include the running count from A1's
prose-only obligation scan as `prose-only obligations: N`), feature completeness matrix, findings by
severity P1 to P4, test coverage, fix plan with effort and affected files, root-cause
analysis (WHY the mistake was made, not just what), prevention rules (proposed CLAUDE.md
additions), and MDD self-improvement (classify each recurring gap as criteria-gap /
criteria-ambiguous / build-gap / doc-field-gap, naming the exact MDD file to change).

The report ALWAYS carries an **Open Items Backlog** section, first-class, not a
grep afterthought: enumerate every unchecked `[ ]`/`[!]` checkbox and every
`known_issues` entry across the whole doc corpus (docs, waves, initiatives),
grouped `[deferred]` vs `[gap]` (untagged counts as `[gap]` and gets flagged for
classification). For each `[gap]`, check whether the feature it waits on has since
landed (grep the referenced feature id, compare its doc `status`), and mark those
"unblocked, re-open candidate". This is the re-open trigger the process otherwise
lacks: a wave closed with an honest documented gap is a decision; an initiative
closed with no visible list of what is still open is debt nobody is looking at.

Spec-fidelity pass (same shape as the donor-provenance check): for each doc, compare
the Business Rules section's own wording against what the doc's scope actually
delivers. A rule whose wording implies more than the doc implements ("schema-validated
documents" delivered as write-path-only) is either a documented narrowing decision
(fine, cite the line where it was decided) or an implicit scope cut (finding, P2+).
Narrowing is allowed; silent narrowing is the defect.

Integration contract verification, proactive, re-reads source as needed: for each
contract, for each caller source file, read its `Contracts:` line in the notes. SATISFIED
is fine; VIOLATION is P1; `(none)` on a file that IS a caller, or a missing line, means
the agent erred, re-read that file and check independently. Report a Contract Violations
section before the findings table. When the report is written, copy the manifest to
`audits/MANIFEST-<date>.md` and delete the job folder.

## A7, present and fix

Say: `[audit 7/8] Report ready.`
Report totals by severity, the top issues, and the report path. Offer: fix all, review
first, or P1+P2 only. On fix, detect the test runner once, then per finding: read the
source, apply the fix, write/update its test, run ONLY that test file. After all fixes,
run the full suite once as a regression check. Remove fixed items from `known_issues`,
bump `mdd_version` on edited docs. Then run a tag pass (generate `tags:` for any doc
missing them), regenerate the connections map explicitly with
`node .claude/hooks/lib/connections-gen.cjs` (audit runs forked, so trigger the generator
directly rather than relying on the connections-sync hook), and rebuild `.mdd/.startup.md`.
Write results to `audits/results-<date>.md`.

## A8, MDD self-review

Say (only if running): `[audit 8/8] MDD self-review.`
Opt-in: skip entirely if `settings.json` has `mdd.selfImprovement === false`. Otherwise
append the self-improvement items to `.mdd/audits/mdd-learnings.md` (dated block,
append-only, each with classification, why MDD missed it, the suggested change, the file
it affects, status pending). Present them and offer to open a GitHub issue at the mdd
repo (Yes / Draft / No); on open, update each entry's status to the issue number.

## Single-feature mode (under 10 files)

Skip the shard/config/agent system. Main runs the per-file loop directly against a
single notes file, clearing context between files. Still build `integration-context.md`
and read it at every startup, and still write the mandatory `Contracts:` line. The job
folder and completion sequence are otherwise identical.
