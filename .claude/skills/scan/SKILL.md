---
name: scan
description: Detect documentation drift across the workspace. Classifies every feature doc as in_sync, drifted, broken, untracked, or no-path by checking source files against git history, plus initiative/wave version drift, ops runbook drift, and connections staleness. Invoke with /scan.
disable-model-invocation: true
user-invocable: true
allowed-tools: "Read, Grep, Glob, Bash, Write"
---

Run `node .claude/hooks/lib/mdd-ensure.cjs` first, before anything else. It creates `.mdd` and its essential files if missing, and is a silent no-op otherwise.

Detect drift between docs and the code they control.

## SC1, read the docs
Read every `.mdd/docs/*.md` and `.mdd/ops/*.md` (excluding `archive/`). For each,
extract `last_synced`, `source_files`, and `path`. Read `.mdd/.drift` too, those ids
were flagged by the sentinel and are the first suspects.

## SC2, check drift (one agent)
Delegate all the git checks to a SINGLE explore agent rather than issuing them one at a
time in the main thread. The bottleneck is issuing `git log` serially, one agent runs
them in quick succession and returns a classification table. Give it the full feature
list (id, `last_synced`, `source_files`), the classification rules, and an instruction
to return a table and write nothing. For each feature it runs `ls <source_file>` for
existence and `git log --oneline --after="<last_synced>" -- <source_file>` for changes.

Classifications: untracked (no `last_synced`), no-path (no `path` field, run
`/upgrade`), broken (a `source_file` missing on disk), drifted (`last_synced`
exists, files exist, commits after it), in_sync (files exist, no commits after). Fall
back to running the checks sequentially if the agent fails.

## SC3, present and save
Report each feature with its classification and detail, a summary line, and the
recommended action per drifted/broken/untracked doc (`/update <id>`), plus
`/upgrade` if any lack `path`. Then:
- Initiative/wave drift (if `.mdd/initiatives/` exists): for each initiative, check each of its waves' `initiative_version` against the initiative's current `version`, flag stale waves for `/plan-sync <id>`.
- Ops drift (if `.mdd/ops/` has files): a runbook whose file was edited since its last recorded runop is flagged for a fresh `/runop <slug>`.
- Connections: missing means broken (run `/connect`), `generated:` older than the newest `last_synced` means stale.

Save the full report to `.mdd/audits/scan-<date>.md`. When you have reconciled a doc or
confirmed it in sync, remove its id from `.mdd/.drift`. Scan detects and recommends, it
never edits a doc body, that is `/update`.

## Messaging

Print one plain `[scan] <what is happening>` line when starting (and at each later
stage of this flow), then work silently. Any question to the user is a
`WAITING ON YOU` line, with the choices presented through the AskUserQuestion tool so the user picks with the arrow keys and enter, NEVER a typed-answer prose prompt. The recommended option is always FIRST and labeled "(Recommended)". Numbered text options are the fallback only when the tool is unavailable (headless or unattended runs). Never an open-ended stop. End with a
short DONE line: what was produced, the key numbers, and the natural next action
(or `BLOCKED, <reason>` with the ways forward offered via AskUserQuestion, recommended first).
Mirror the steps to the status bar: run `node .claude/hooks/lib/statusbar.cjs set scan <step> <total> "<label>"` alongside each line and `node .claude/hooks/lib/statusbar.cjs done scan` with the DONE line (pre-approved, best-effort, silent). At the very FIRST Say line also run `node .claude/hooks/lib/statusbar.cjs run-start <flow>`, ONLY when the user invoked this skill (directly or via plain-language routing); NEVER when executing inside another MDD flow, the outermost user-invoked run owns the elapsed timer and sub-runs must not touch it. Whenever stopping for user input (any WAITING ON YOU), first run `node .claude/hooks/lib/statusbar.cjs pause` so waiting time never counts as run time; the timer resumes automatically on the next `set` after the answer. When the run completes, the freezing `done <flow>`/`run-done` call PRINTS `MDD <run> completed in <elapsed>`: repeat that line VERBATIM as the very LAST user-visible line of the run, after everything else in the DONE block, always. Task checklist, always: at run start create the session task list (TodoWrite / the native task tool) with one entry per step of this skill, named exactly like the Say lines; mark the current entry in_progress and check each one off AT the moment its step completes, so the full plan, what is done, and what is running are visible the whole run. Same ownership rule as the timer: the user-invoked wrapper creates the list; a skill executing inside another MDD flow NEVER creates or replaces it, the wrapper's list already carries that work as an entry. Micro-status: the checklist is the broad strokes; the status bar label is the LIVE one. Between Say lines, refresh it (`set <flow> <N> <T> "<msg>"`, same phase numbers) every time the concrete action changes: dispatching agents, reading a file, writing a specific file, running the suite, gate iteration K, waiting on a command. Present tense, specific, short (under ~48 chars), e.g. "writing tests/auth.test.ts", "suite run 2, 3 red", "wiring routes/session.ts". A label that sits unchanged through many actions reads as hung; the set call is near-free, refresh it liberally.
