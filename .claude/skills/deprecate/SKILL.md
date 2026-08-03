---
name: deprecate
description: Retire a feature doc safely. Flags every dependent, sets status deprecated, archives the doc, asks separately before deleting source or test files, and rebuilds the brief. Never auto-deletes code. Invoke with /deprecate followed by the doc id.
disable-model-invocation: true
user-invocable: true
argument-hint: "[feature doc id]"
arguments: [id]
---

Run `node .claude/hooks/lib/mdd-ensure.cjs` first, before anything else. It creates `.mdd` and its essential files if missing, and is a silent no-op otherwise.

Deprecate feature doc: $id

Retiring a feature is a graph operation, not a delete. The danger is orphaning the docs
that depend on this one.

## D1, load and impact
Find and read the target doc. Scan all other `.mdd/docs/*.md` for any that list `$id`
in `depends_on`. Build the impact list, and read the doc's `source_files` and
`test_files`.

## D2, present
Show what will happen (set `status: deprecated`, move to `.mdd/docs/archive/`), the
dependent docs, and the registered source and test files. Warn clearly if there are
dependents, deprecating a depended-on feature breaks their contract. Ask: proceed,
review dependents first, or cancel.

## D3, archive
On yes:
1. Set `status: deprecated` and `last_synced: today` in the doc.
2. Create `.mdd/docs/archive/` if needed and move the doc there. MDD never destroys history.
3. For each dependent, append to its `known_issues`: "<id> has been deprecated, review this dependency."
4. Ask SEPARATELY, never auto-delete: "Delete source files? (yes/no)" and "Delete test files? (yes/no)".
5. Rebuild `.mdd/.startup.md` (the /status logic). The connections map updates on its own, the connections-sync hook regenerates it when it sees the doc move to archive.

Report the archived path, how many dependents were flagged, and what was kept or deleted.

## Messaging

Print one plain `[deprecate] <what is happening>` line when starting (and at each later
stage of this flow), then work silently. Any question to the user is a
`WAITING ON YOU` line, with the choices presented through the AskUserQuestion tool so the user picks with the arrow keys and enter, NEVER a typed-answer prose prompt. The recommended option is always FIRST and labeled "(Recommended)". Numbered text options are the fallback only when the tool is unavailable (headless or unattended runs). Never an open-ended stop. End with a
short DONE line: what was produced, the key numbers, and the natural next action
(or `BLOCKED, <reason>` with the ways forward offered via AskUserQuestion, recommended first).
Mirror the steps to the status bar: run `node .claude/hooks/lib/statusbar.cjs set deprecate <step> <total> "<label>"` alongside each line and `node .claude/hooks/lib/statusbar.cjs done deprecate` with the DONE line (pre-approved, best-effort, silent). At the very FIRST Say line also run `node .claude/hooks/lib/statusbar.cjs run-start <flow>`, ONLY when the user invoked this skill (directly or via plain-language routing); NEVER when executing inside another MDD flow, the outermost user-invoked run owns the elapsed timer and sub-runs must not touch it. Whenever stopping for user input (any WAITING ON YOU), first run `node .claude/hooks/lib/statusbar.cjs pause` so waiting time never counts as run time; the timer resumes automatically on the next `set` after the answer. When the run completes, the freezing `done <flow>`/`run-done` call PRINTS `MDD <run> completed in <elapsed>`: repeat that line VERBATIM as the very LAST user-visible line of the run, after everything else in the DONE block, always. Task checklist, always: at run start create the session task list (TodoWrite / the native task tool) with one entry per step of this skill, named exactly like the Say lines; mark the current entry in_progress and check each one off AT the moment its step completes, so the full plan, what is done, and what is running are visible the whole run. Same ownership rule as the timer: the user-invoked wrapper creates the list; a skill executing inside another MDD flow NEVER creates or replaces it, the wrapper's list already carries that work as an entry. Micro-status: the checklist is the broad strokes; the status bar label is the LIVE one. Between Say lines, refresh it (`set <flow> <N> <T> "<msg>"`, same phase numbers) every time the concrete action changes: dispatching agents, reading a file, writing a specific file, running the suite, gate iteration K, waiting on a command. Present tense, specific, short (under ~48 chars), e.g. "writing tests/auth.test.ts", "suite run 2, 3 red", "wiring routes/session.ts". A label that sits unchanged through many actions reads as hung; the set call is near-free, refresh it liberally.
