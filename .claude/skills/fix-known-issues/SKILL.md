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

Task checklist shape: create it at Phase 1 with the five phases; after the
Phase 3 decisions, add one entry per approved item, checked off as each closes.

Status bar mirror: at Phase 1 run `node .claude/hooks/lib/statusbar.cjs run-start fix-issues` (only when user-invoked). Whenever stopping for user input (any WAITING ON YOU), first run `node .claude/hooks/lib/statusbar.cjs pause` so waiting time never counts as run time; the timer resumes automatically on the next `set` after the answer. When the run completes, the freezing `done <flow>`/`run-done` call PRINTS `MDD <run> completed in <elapsed>`: repeat that line VERBATIM as the very LAST user-visible line of the run, after everything else in the DONE block, always. Task checklist, always: at run start create the session task list (TodoWrite / the native task tool) with one entry per step of this skill, named exactly like the Say lines; mark the current entry in_progress and check each one off AT the moment its step completes, so the full plan, what is done, and what is running are visible the whole run. Same ownership rule as the timer: the user-invoked wrapper creates the list; a skill executing inside another MDD flow NEVER creates or replaces it, the wrapper's list already carries that work as an entry. Micro-status: the checklist is the broad strokes; the status bar label is the LIVE one. Between Say lines, refresh it (`set <flow> <N> <T> "<msg>"`, same phase numbers) every time the concrete action changes: dispatching agents, reading a file, writing a specific file, running the suite, gate iteration K, waiting on a command. Present tense, specific, short (under ~48 chars), e.g. "writing tests/auth.test.ts", "suite run 2, 3 red", "wiring routes/session.ts". A label that sits unchanged through many actions reads as hung; the set call is near-free, refresh it liberally. Then alongside each phase's Say line run
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

Say: `[fix-issues 3/5] Plan below.` Then the full table, one `WAITING ON YOU` line, and the decisions presented through the AskUserQuestion tool (arrow keys and enter, recommended option first and marked "(Recommended)"), never typed-answer prompts.

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
