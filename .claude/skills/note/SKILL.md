---
name: note
description: Manage the append-only notes log in the MDD session brief. Add a durable working note, list the current notes, or clear them. Invoke with /note followed by the text, or "note list" / "note clear".
disable-model-invocation: true
user-invocable: true
argument-hint: "[note text | list | clear]"
arguments: [arg]
---

Run `node .claude/hooks/lib/mdd-ensure.cjs` first, before anything else. It creates `.mdd` and its essential files if missing, and is a silent no-op otherwise.

Manage the notes log in `.mdd/.startup.md` (the append-only zone below the `## Notes`
divider). This is the disk-is-memory scratchpad that survives compaction and greets
the next session.

- **Add** (default): append `$arg` as a dated one-line entry below the `## Notes`
  divider. Never touch the auto-generated zone above the divider (that belongs to
  /status). A good note is durable and specific: "staging DB is the one named
  prod_replica", not "working on auth".
- **`list`**: print the current notes.
- **`clear`**: remove all entries below the divider, after confirming with the user.

Keep notes to genuine working memory: a decision made, a gotcha hit ("tried X, broke
Y, use Z"), a thing to pick up next. Anything durable and project-level about how the
code works belongs in a feature doc or a rule, not here.

## Messaging

Print one plain `[note] <what is happening>` line when starting (and at each later
stage of this flow), then work silently. Any question to the user is a
`WAITING ON YOU` line, with the choices presented through the AskUserQuestion tool so the user picks with the arrow keys and enter, NEVER a typed-answer prose prompt. The recommended option is always FIRST and labeled "(Recommended)". Numbered text options are the fallback only when the tool is unavailable (headless or unattended runs). Never an open-ended stop. End with a
short DONE line: what was produced, the key numbers, and the natural next action
(or `BLOCKED, <reason>` with the ways forward offered via AskUserQuestion, recommended first).
Mirror the steps to the status bar: run `node .claude/hooks/lib/statusbar.cjs set note <step> <total> "<label>"` alongside each line and `node .claude/hooks/lib/statusbar.cjs done note` with the DONE line (pre-approved, best-effort, silent). At the very FIRST Say line also run `node .claude/hooks/lib/statusbar.cjs run-start <flow>`, ONLY when the user invoked this skill (directly or via plain-language routing); NEVER when executing inside another MDD flow, the outermost user-invoked run owns the elapsed timer and sub-runs must not touch it. Whenever stopping for user input (any WAITING ON YOU), first run `node .claude/hooks/lib/statusbar.cjs pause` so waiting time never counts as run time; the timer resumes automatically on the next `set` after the answer. When the run completes, the freezing `done <flow>`/`run-done` call PRINTS `MDD <run> completed in <elapsed>`: repeat that line VERBATIM as the very LAST user-visible line of the run, after everything else in the DONE block, always. Task checklist, always: at run start create the session task list (TodoWrite / the native task tool) with one entry per step of this skill, named exactly like the Say lines; mark the current entry in_progress and check each one off AT the moment its step completes, so the full plan, what is done, and what is running are visible the whole run. Same ownership rule as the timer: the user-invoked wrapper creates the list; a skill executing inside another MDD flow NEVER creates or replaces it, the wrapper's list already carries that work as an entry. Micro-status: the checklist is the broad strokes; the status bar label is the LIVE one. Between Say lines, refresh it (`set <flow> <N> <T> "<msg>"`, same phase numbers) every time the concrete action changes: dispatching agents, reading a file, writing a specific file, running the suite, gate iteration K, waiting on a command. Present tense, specific, short (under ~48 chars), e.g. "writing tests/auth.test.ts", "suite run 2, 3 red", "wiring routes/session.ts". A label that sits unchanged through many actions reads as hung; the set call is near-free, refresh it liberally.
