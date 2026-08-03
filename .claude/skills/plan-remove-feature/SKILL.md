---
name: plan-remove-feature
description: Remove a feature from a wave safely, blocking if another feature in the wave depends on it, and optionally archiving its doc. Invoke with /plan-remove-feature followed by the wave slug and feature slug.
disable-model-invocation: true
user-invocable: true
argument-hint: "[wave slug] [feature slug]"
arguments: [wave, feature]
---

Run `node .claude/hooks/lib/mdd-ensure.cjs` first, before anything else. It creates `.mdd` and its essential files if missing, and is a silent no-op otherwise.

Remove feature $feature from wave $wave.

## PRF1, load and validate
Read the wave doc (hard stop if missing) and find the feature's row (hard stop if not in
the wave). Dependency guard: if any other feature in the wave lists `$feature` in its
depends-on column, stop, that dependency must be removed or reassigned first.

## PRF2, confirm and remove
Show the feature, its wave, its doc path and status, and ask to remove. If a feature doc
exists, ask separately whether to archive it. On confirm: remove the row from the wave's
Features table, renumber the number column (safe, since depends-on uses slugs not
numbers), and if archiving, move the doc to `.mdd/docs/archive/` with `status: archived`
and `wave_status: archived`. Recompute the wave hash, rebuild `.mdd/.startup.md`, and tell
the user to re-run `/plan-execute <wave>` to continue.

## Messaging

Print one plain `[plan-remove-feature] <what is happening>` line when starting (and at each later
stage of this flow), then work silently. Any question to the user is a
`WAITING ON YOU` line, with the choices presented through the AskUserQuestion tool so the user picks with the arrow keys and enter, NEVER a typed-answer prose prompt. The recommended option is always FIRST and labeled "(Recommended)". Numbered text options are the fallback only when the tool is unavailable (headless or unattended runs). Never an open-ended stop. End with a
short DONE line: what was produced, the key numbers, and the natural next action
(or `BLOCKED, <reason>` with the ways forward offered via AskUserQuestion, recommended first).
Mirror the steps to the status bar: run `node .claude/hooks/lib/statusbar.cjs set plan-remove-feature <step> <total> "<label>"` alongside each line and `node .claude/hooks/lib/statusbar.cjs done plan-remove-feature` with the DONE line (pre-approved, best-effort, silent). At the very FIRST Say line also run `node .claude/hooks/lib/statusbar.cjs run-start <flow>`, ONLY when the user invoked this skill (directly or via plain-language routing); NEVER when executing inside another MDD flow, the outermost user-invoked run owns the elapsed timer and sub-runs must not touch it. Whenever stopping for user input (any WAITING ON YOU), first run `node .claude/hooks/lib/statusbar.cjs pause` so waiting time never counts as run time; the timer resumes automatically on the next `set` after the answer. When the run completes, the freezing `done <flow>`/`run-done` call PRINTS `MDD <run> completed in <elapsed>`: repeat that line VERBATIM as the very LAST user-visible line of the run, after everything else in the DONE block, always. Task checklist, always: at run start create the session task list (TodoWrite / the native task tool) with one entry per step of this skill, named exactly like the Say lines; mark the current entry in_progress and check each one off AT the moment its step completes, so the full plan, what is done, and what is running are visible the whole run. Same ownership rule as the timer: the user-invoked wrapper creates the list; a skill executing inside another MDD flow NEVER creates or replaces it, the wrapper's list already carries that work as an entry. Micro-status: the checklist is the broad strokes; the status bar label is the LIVE one. Between Say lines, refresh it (`set <flow> <N> <T> "<msg>"`, same phase numbers) every time the concrete action changes: dispatching agents, reading a file, writing a specific file, running the suite, gate iteration K, waiting on a command. Present tense, specific, short (under ~48 chars), e.g. "writing tests/auth.test.ts", "suite run 2, 3 red", "wiring routes/session.ts". A label that sits unchanged through many actions reads as hung; the set call is near-free, refresh it liberally.
