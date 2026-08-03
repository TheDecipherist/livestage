---
name: update
description: Resync a feature doc with code that changed since the last session. Diffs the doc against its source, rewrites only the affected sections, preserves known_issues and dependencies, appends test skeletons for new behaviors, and clears the drift flag. Invoke with /update followed by the doc id.
disable-model-invocation: true
user-invocable: true
argument-hint: "[feature doc id]"
arguments: [id]
---

Run `node .claude/hooks/lib/mdd-ensure.cjs` first, before anything else. It creates `.mdd` and its essential files if missing, and is a silent no-op otherwise.

Resync feature doc: $id

The full reconciliation the drift sentinel points to when an inline patch is not enough.

## U1, load
Find and read `.mdd/docs/$id.md` (accept `04` or `04-content-builder`). If not found,
list the docs and ask which.

## U2, read the source
Read every file in `source_files`. A missing file is a broken reference, ask the user
for the new path before continuing.

## U3, diff doc vs code
Compare what the doc says against what the code does: new functions/endpoints/exports
not in the doc, removed or renamed things the doc still mentions, changed model fields,
changed business rules, new edge cases visible in error handling. Write findings to
`.mdd/audits/update-notes-$id-<date>.md`, not into memory.

## U4, present (gate)
Show what was added, removed, and changed since `last_synced`, and which doc sections
need updating. Ask: proceed, review findings first, or cancel. Wait for confirmation.

## U5, rewrite only what changed
Rewrite ONLY the drifted sections. Preserve `known_issues` as-is (it holds ACTIVE
issues only; /update may append a newly-found issue but never closes one, closing
is /fix-known-issues' job via the doc's `## Fixed Issues` section, which is
preserved verbatim, as is `## Bug Fixes`), `depends_on` (add only, never remove without asking), and any
still-accurate prose.
Then update frontmatter: `last_synced: today`, ask whether to change `status`, update
`phase`, and if the doc has no `path`, offer to add one (insert between `tags` and
`known_issues`). Refresh the fact-fields against what U2 actually read: files that
appeared or moved update `source_files`, and any test file exercising this feature
that `test_files` does not carry gets added (empty `test_files` on a complete
COMPONENT will not even write, the validator rejects it; /update touching an older
doc is exactly where that surfaces, fix the field, do not fight the hook).

## U6, test skeletons
For any NEW documented behavior, append test skeleton entries to the existing test
file, never modifying existing test implementations. Remove `$id` from `.mdd/.drift`.
(The connections map is regenerated on its own by the connections-sync hook when the
doc is written, no manual rebuild needed.) Report the sections rewritten,
the new skeletons, and the branch. If the update reveals the feature has grown into two,
suggest splitting rather than letting one doc sprawl.

## Messaging

Print one plain `[update] <what is happening>` line when starting (and at each later
stage of this flow), then work silently. Any question to the user is a
`WAITING ON YOU` line, with the choices presented through the AskUserQuestion tool so the user picks with the arrow keys and enter, NEVER a typed-answer prose prompt. The recommended option is always FIRST and labeled "(Recommended)". Numbered text options are the fallback only when the tool is unavailable (headless or unattended runs). Never an open-ended stop. End with a
short DONE line: what was produced, the key numbers, and the natural next action
(or `BLOCKED, <reason>` with the ways forward offered via AskUserQuestion, recommended first).
Mirror the steps to the status bar: run `node .claude/hooks/lib/statusbar.cjs set update <step> <total> "<label>"` alongside each line and `node .claude/hooks/lib/statusbar.cjs done update` with the DONE line (pre-approved, best-effort, silent). At the very FIRST Say line also run `node .claude/hooks/lib/statusbar.cjs run-start <flow>`, ONLY when the user invoked this skill (directly or via plain-language routing); NEVER when executing inside another MDD flow, the outermost user-invoked run owns the elapsed timer and sub-runs must not touch it. Whenever stopping for user input (any WAITING ON YOU), first run `node .claude/hooks/lib/statusbar.cjs pause` so waiting time never counts as run time; the timer resumes automatically on the next `set` after the answer. When the run completes, the freezing `done <flow>`/`run-done` call PRINTS `MDD <run> completed in <elapsed>`: repeat that line VERBATIM as the very LAST user-visible line of the run, after everything else in the DONE block, always. Task checklist, always: at run start create the session task list (TodoWrite / the native task tool) with one entry per step of this skill, named exactly like the Say lines; mark the current entry in_progress and check each one off AT the moment its step completes, so the full plan, what is done, and what is running are visible the whole run. Same ownership rule as the timer: the user-invoked wrapper creates the list; a skill executing inside another MDD flow NEVER creates or replaces it, the wrapper's list already carries that work as an entry. Micro-status: the checklist is the broad strokes; the status bar label is the LIVE one. Between Say lines, refresh it (`set <flow> <N> <T> "<msg>"`, same phase numbers) every time the concrete action changes: dispatching agents, reading a file, writing a specific file, running the suite, gate iteration K, waiting on a command. Present tense, specific, short (under ~48 chars), e.g. "writing tests/auth.test.ts", "suite run 2, 3 red", "wiring routes/session.ts". A label that sits unchanged through many actions reads as hung; the set call is near-free, refresh it liberally.
