---
name: bug
description: Report and fix a bug in an existing feature. Traces the symptom into the actual failing code first, derives the owning feature docs from the files the defect lives in (word-scoring is only a supplement), records the open bug in known_issues, fixes it lightweight or through the full MDD gates, reconciles the real diff against the doc set, and moves the record to a dated Bug Fixes section at the bottom of every touched doc. Invoke with /bug followed by the symptom. AUTO-INVOKE in an MDD project (an .mdd/ workspace exists) whenever the user reports broken, wrong, or regressed behavior in plain language ("X is broken", "Y returns the wrong Z", "this crashes when...") without naming a skill. Do NOT auto-invoke for building something new (/build), for chores or refactors (/task), or when the user explicitly asks for a quick ad-hoc fix outside MDD (confirm once, then respect it).
user-invocable: true
argument-hint: "[bug symptom]"
arguments: [symptom]
---

Run `node .claude/hooks/lib/mdd-ensure.cjs` first, before anything else. It creates `.mdd` and its essential files if missing, and is a silent no-op otherwise.

Fix the bug: $symptom

Do NOT create a new feature doc. A bug belongs to existing features; the job is to
find WHICH ones from the code itself, record it, fix it, and leave a dated trace in
every doc it touched. Never work on main.

## B0, parse
If `$symptom` is empty, ask what is broken and where it should work correctly.

## B1, locate the defect FIRST (code before docs)

The owning docs are derived from where the bug LIVES, never from which doc's tags
happen to share words with the symptom. Trace the symptom into the code: grep the
symptom's symbols and strings, follow with LSP `goToDefinition`/`findReferences` to
pin the real definition and every call site (grep alone over- and under-matches),
read the candidates, and reproduce or at least explain the failure (what the code
does, why that produces the symptom). Output of this step: the DEFECT FILE SET, the
files the fix will plausibly touch, with the suspected root cause.

## B2, map files to owning docs, then confirm

For every file in the defect set, find the docs whose `source_files` contain it:
that mapping is exact and is the primary answer. Supplement with the old word-score
pass (symptom tokens against tags, title, filenames) ONLY to surface related docs
the file mapping missed, scored candidates clearly marked as guesses. Files in the
defect set that NO doc owns are reported plainly ("undocumented code, the fix will
proceed but /reverse-engineer owes this area a doc"). Present the derived set, the
guesses, and the full doc list; ask (multiSelect) to confirm, at least one doc or an
explicit "undocumented" acknowledgment.

## B3, record the open bug

For each confirmed doc, add an entry to its `known_issues` frontmatter list:
`[gap] B<N>: <symptom>` (next B-number from the doc's existing entries and Bug
Fixes section, or B1). This puts open bugs in the SAME open-items machinery
everything else uses: /status counts them, /audit's backlog lists them,
/fix-known-issues can drain them. Legacy migration, one-time per doc: if the doc
still has an old `## Bugs` table, move its Open rows into `known_issues` in this
format and its fixed rows into the `## Bug Fixes` section (B5's format), then
delete the table.

## B4, fix

Ask how to proceed:
- Lightweight: minimal targeted change at the root cause (no adjacent refactor),
  diagnose before touching anything (what the code does, why it causes the bug, the
  fix, the side-effect risk), verify with typecheck plus the test runner or a real
  run, and write a regression test unless the user explicitly skips it.
- Full MDD: run build Phases 4 to 7 for the fix, treating the confirmed docs as the
  documentation (skip Phases 1 to 3). Failing regression test first (Red Gate), fix
  to green, verify. Test Freeze applies once phase is implement.

## B5, reconcile the REAL diff, then close the record

Before closing, diff what was actually changed (`git diff --name-only` on the fix
branch) against the confirmed doc set: any changed file owned by a doc NOT in the
set means the fix outgrew the guess, add that doc now, record the bug in it (B3
format), and say so. The docs updated must match the fix that happened, not the
plan from before anyone read the code.

Then, in EVERY doc of the final set: remove the `[gap] B<N>` entry from
`known_issues` and append to a `## Bug Fixes` section at the BOTTOM of the doc
(create it on first use, below `## Fixed Issues` when both exist), one entry per
bug:

```
### B<N> (fixed <YYYY-MM-DD>)
Symptom: <what the user reported>
Cause: <the root cause, one or two lines>
Fix: <file:line of the root-cause change> | Regression test: <test locator, or "skipped by user">
```

When the root-cause fix lives in another feature's files, the entry says so
(`Fix: see 07-parser B3`). A regression test written into a NEW test file also
gets that file appended to the owning doc's `test_files` (an existing test file
already listed needs nothing); the field is what Test Freeze protects, so a
regression test the field does not carry is an unprotected regression test.
Set each doc's `last_synced`. Report the bug, the fix
location, the docs updated, and the branch, then offer to commit and merge (stage,
conventional commit, merge --no-ff, ask before push; the main-safety gate from
plan-execute PE4 applies before main moves).

## Messaging

Print one plain `[bug] <what is happening>` line when starting (and at each later
stage of this flow), then work silently. Any question to the user is a
`WAITING ON YOU` line, with the choices presented through the AskUserQuestion tool so the user picks with the arrow keys and enter, NEVER a typed-answer prose prompt. The recommended option is always FIRST and labeled "(Recommended)". Numbered text options are the fallback only when the tool is unavailable (headless or unattended runs). Never an open-ended stop. End with a
short DONE line: what was produced, the key numbers, and the natural next action
(or `BLOCKED, <reason>` with the ways forward offered via AskUserQuestion, recommended first).
Mirror the steps to the status bar: run `node .claude/hooks/lib/statusbar.cjs set bug <step> <total> "<label>"` alongside each line and `node .claude/hooks/lib/statusbar.cjs done bug` with the DONE line (pre-approved, best-effort, silent). At the very FIRST Say line also run `node .claude/hooks/lib/statusbar.cjs run-start <flow>`, ONLY when the user invoked this skill (directly or via plain-language routing); NEVER when executing inside another MDD flow, the outermost user-invoked run owns the elapsed timer and sub-runs must not touch it. Whenever stopping for user input (any WAITING ON YOU), first run `node .claude/hooks/lib/statusbar.cjs pause` so waiting time never counts as run time; the timer resumes automatically on the next `set` after the answer. When the run completes, the freezing `done <flow>`/`run-done` call PRINTS `MDD <run> completed in <elapsed>`: repeat that line VERBATIM as the very LAST user-visible line of the run, after everything else in the DONE block, always. Task checklist, always: at run start create the session task list (TodoWrite / the native task tool) with one entry per step of this skill, named exactly like the Say lines; mark the current entry in_progress and check each one off AT the moment its step completes, so the full plan, what is done, and what is running are visible the whole run. Same ownership rule as the timer: the user-invoked wrapper creates the list; a skill executing inside another MDD flow NEVER creates or replaces it, the wrapper's list already carries that work as an entry. Micro-status: the checklist is the broad strokes; the status bar label is the LIVE one. Between Say lines, refresh it (`set <flow> <N> <T> "<msg>"`, same phase numbers) every time the concrete action changes: dispatching agents, reading a file, writing a specific file, running the suite, gate iteration K, waiting on a command. Present tense, specific, short (under ~48 chars), e.g. "writing tests/auth.test.ts", "suite run 2, 3 red", "wiring routes/session.ts". A label that sits unchanged through many actions reads as hung; the set call is near-free, refresh it liberally.
