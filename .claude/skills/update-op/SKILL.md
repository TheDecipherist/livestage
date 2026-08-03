---
name: update-op
description: Edit an existing deployment runbook. Re-asks the ops questions with current values pre-filled, shows a diff, and rewrites only changed sections while preserving live service health data and known issues. Invoke with /update-op followed by the slug.
disable-model-invocation: true
user-invocable: true
argument-hint: "[runbook slug]"
arguments: [slug]
---

Run `node .claude/hooks/lib/mdd-ensure.cjs` first, before anything else. It creates `.mdd` and its essential files if missing, and is a silent no-op otherwise.

Edit runbook: $slug

## UO1, load
Require the slug. Find it project-first (`.mdd/ops/$slug.md`) then global
(`~/.claude/ops/$slug.md`), noting scope; hard stop if neither exists.

## UO2, re-ask
Re-present the ops questions with the current values as defaults. Accept unchanged, take
new values where given. Show a diff summary of what changed (regions added, images bumped,
gate behavior changed) and ask to apply.

## UO3, rewrite
Rewrite only the changed sections. Preserve `known_issues` (never drop without asking) and
each service's live `status` and `last_checked` (that is runtime data, not config). Set
`last_synced: today`, and drop `status` back to `draft` if it was `complete` and the change
was structural. Report the sections rewritten.

## Messaging

Print one plain `[update-op] <what is happening>` line when starting (and at each later
stage of this flow), then work silently. Any question to the user is a
`WAITING ON YOU` line, with the choices presented through the AskUserQuestion tool so the user picks with the arrow keys and enter, NEVER a typed-answer prose prompt. The recommended option is always FIRST and labeled "(Recommended)". Numbered text options are the fallback only when the tool is unavailable (headless or unattended runs). Never an open-ended stop. End with a
short DONE line: what was produced, the key numbers, and the natural next action
(or `BLOCKED, <reason>` with the ways forward offered via AskUserQuestion, recommended first).
Mirror the steps to the status bar: run `node .claude/hooks/lib/statusbar.cjs set update-op <step> <total> "<label>"` alongside each line and `node .claude/hooks/lib/statusbar.cjs done update-op` with the DONE line (pre-approved, best-effort, silent). At the very FIRST Say line also run `node .claude/hooks/lib/statusbar.cjs run-start <flow>`, ONLY when the user invoked this skill (directly or via plain-language routing); NEVER when executing inside another MDD flow, the outermost user-invoked run owns the elapsed timer and sub-runs must not touch it. Whenever stopping for user input (any WAITING ON YOU), first run `node .claude/hooks/lib/statusbar.cjs pause` so waiting time never counts as run time; the timer resumes automatically on the next `set` after the answer. When the run completes, the freezing `done <flow>`/`run-done` call PRINTS `MDD <run> completed in <elapsed>`: repeat that line VERBATIM as the very LAST user-visible line of the run, after everything else in the DONE block, always. Task checklist, always: at run start create the session task list (TodoWrite / the native task tool) with one entry per step of this skill, named exactly like the Say lines; mark the current entry in_progress and check each one off AT the moment its step completes, so the full plan, what is done, and what is running are visible the whole run. Same ownership rule as the timer: the user-invoked wrapper creates the list; a skill executing inside another MDD flow NEVER creates or replaces it, the wrapper's list already carries that work as an entry. Micro-status: the checklist is the broad strokes; the status bar label is the LIVE one. Between Say lines, refresh it (`set <flow> <N> <T> "<msg>"`, same phase numbers) every time the concrete action changes: dispatching agents, reading a file, writing a specific file, running the suite, gate iteration K, waiting on a command. Present tense, specific, short (under ~48 chars), e.g. "writing tests/auth.test.ts", "suite run 2, 3 red", "wiring routes/session.ts". A label that sits unchanged through many actions reads as hung; the set call is near-free, refresh it liberally.
