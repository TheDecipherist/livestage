---
name: fix-known-issues
description: Work through every known_issues entry across the MDD docs and close them out. Verifies stale entries against the code, fixes what is mechanically fixable through a mini red-green loop, asks the user once about everything needing a decision, and moves each closed entry to the doc's Fixed Issues section with the fix date and evidence, so known_issues holds only active issues. Invoke with /fix-known-issues, optionally scoped to a doc id or tag.
disable-model-invocation: true
user-invocable: true
argument-hint: "[doc id | gap | deferred]"
arguments: [scope]
allowed-tools: "Read, Grep, Glob, Bash, Edit, Write, Task"
---

Run `node .claude/hooks/lib/mdd-ensure.cjs` first, before anything else.

Turn the known_issues backlog from documentation into closed work. The audit
enumerates it; this skill drains it. Five phases, one user interaction.

Status bar mirror: alongside each phase's Say line run
`node .claude/hooks/lib/statusbar.cjs set fix-issues <N> 5 "<label>"`, and
`done fix-issues` at the end.

## Phase 1: Collect

Say: `[fix-issues 1/5] Collecting known_issues across the doc corpus.`

Grep `known_issues` across `.mdd/docs/`, `.mdd/waves/`, `.mdd/initiatives/`
(skip `archive/`). `known_issues` holds ACTIVE unfixed issues only, so
everything found is open by definition. Build one table: doc id, entry text,
tag (`[deferred]` / `[gap]`, untagged reads as `[gap]`), and the feature ids
or files the entry references. If `$scope` is set, filter to that doc id or
tag class.

Zero open entries: say so, `done fix-issues`, stop. That is a good result,
not an anticlimax.

## Phase 2: Triage every entry into exactly one bucket

Say: `[fix-issues 2/5] Triaging N entries.`

Verify against the code, never against the entry's own claim; entries rot.
- **STALE**: the thing it waits on has since landed, or the described behavior
  now exists. Prove it (read the code, run the test or the real invocation),
  cite the evidence. The backward sweep misses these when a wave closed before
  the dependency landed; this is where they get caught.
- **FIXABLE**: a real, scoped defect or omission with a clear done-condition
  that needs no product decision (an unwired flag, a missing option, an
  unreachable path, a missing check). Estimate blast radius: files touched,
  whether behavior visible to users changes.
- **NEEDS-DECISION**: `[deferred]` entries (a human decided to postpone;
  un-deferring is the human's call too), anything whose fix has more than one
  defensible scope, anything touching architecture or a business rule's
  meaning (the spec-fidelity narrowings from /audit land here).
- **BLOCKED**: needs something external (a credential, a service, an upstream
  release). Record what exactly, these stay open with a sharper note.

## Phase 3: One WAITING ON YOU block, everything upfront

Say: `[fix-issues 3/5] Plan below.` Then the full table and a `WAITING ON YOU` block.

Present: STALE (will close with evidence), FIXABLE (will fix, with the
per-item blast radius), NEEDS-DECISION (each with the options and a
recommendation), BLOCKED (kept open, sharpened note). Ask everything in this
one interaction: approve the FIXABLE list as scoped and decide each
NEEDS-DECISION item (do now / keep deferred / drop as won't-fix). Wait for
the answers.

## Phase 4: Fix loop

Say: `[fix-issues 4/5] Fixing K approved items.` One line per item as it closes.

Branch first if on the default branch (the branch guard will insist anyway).
Per approved item, smallest honest version of the build loop:
- Behavior-changing fix: failing test FIRST that reproduces the issue (mini
  Red), then the fix, then green plus the full suite. An entry closed without
  a test that would go red on regression is not closed, it is re-opened later.
- Entry about a missing invocation path (the entry-surface class): the proof
  is one live invocation through the real surface, pasted, not a unit test.
- Doc-only entries (wrong claim, stale reference): correct the doc section.
- Stop rule: an item that grows beyond its approved blast radius mid-fix goes
  back to NEEDS-DECISION and is reported, never silently expanded (scope
  discipline is why [deferred] exists).

Closing an entry moves it, never tags it in place: REMOVE the entry from the
doc's `known_issues` frontmatter list (which holds active issues only) and
APPEND it to a `## Fixed Issues` section at the BOTTOM of the doc body
(create the section on first use), one line per issue:
`- <original entry text> (fixed <date>, <test or file:line or commit>)`.
Won't-fix decisions from Phase 3 land in the same section as
`(closed won't-fix <date>, <the user's why>)`. Set the doc's `last_synced`.
Batch entries of the same doc into one doc write.

## Phase 5: Verify and report

Say: `[fix-issues 5/5] Verifying and reporting.`

Full test suite and typecheck must pass. Then the closing report: fixed (with
evidence pointers), marked stale, kept deferred (with the human's re-affirmed
why), dropped as won't-fix, still blocked (with what unblocks each). Re-run
the Phase 1 grep and show the before/after open counts, that delta is the
deliverable. `done fix-issues`, then offer to commit (conventional message,
ask before push).

## Rules
- An entry leaves `known_issues` ONLY by moving to the doc's `## Fixed Issues`
  section with a date and evidence. Silent deletion never happens; the
  frontmatter list stays purely "what is open", the body section is the
  history.
- Never fix a `[deferred]` item without the user un-deferring it, a recorded
  decision outranks an available fix.
- Every closed entry carries evidence a future audit can check.
