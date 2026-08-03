---
name: task
description: Do a scoped piece of work that is not a full feature (a chore, a config change, a small refactor) while still recording it the MDD way. Produces a task-type doc that is frozen and never flagged as drifted. Invoke with /task followed by the description. AUTO-INVOKE in an MDD project (an .mdd/ workspace exists) whenever the user asks in plain language for a chore, config change, dependency bump, rename, cleanup, or small refactor that is not a feature and not a defect, without naming a skill. Do NOT auto-invoke for new features (/build), broken behavior (/bug), or when the user explicitly asks for a quick ad-hoc change outside MDD (confirm once, then respect it).
user-invocable: true
argument-hint: "[task description]"
arguments: [task]
---

Run `node .claude/hooks/lib/mdd-ensure.cjs` first, before anything else. It creates `.mdd` and its essential files if missing, and is a silent no-op otherwise.

Do the task: $task

A task is work that has no ongoing behavior contract to protect: a dependency bump,
a build-config change, a rename, a one-off migration. It still gets a doc so the
history exists, but a lighter one.

## Flow
1. Branch first, never `main`.
2. Write a short doc to `.mdd/docs/NN-slug.md` with `type: task` and `status: done`
   in the frontmatter. Record what the task is, why, and which files it touched in
   `source_files`. A task doc has no `routes`/`models` contract to keep in sync.
3. Do the work. Standard gates still apply through the hooks (Branch Guard, the
   safety guards), but there is no Red/Green test cycle unless the task warrants one.
4. Set `last_synced` to today.

## Why type: task matters
A `type: task` doc is frozen: `/scan` never reports it as drifted, because there
is no living contract for the code to drift from. Use `task` for exactly that case,
and `build` when there is behavior to document and test. When in doubt, it is a
build.

## Messaging

Print one plain `[task] <what is happening>` line when starting (and at each later
stage of this flow), then work silently. Any question to the user is a
`WAITING ON YOU` line, with the choices presented through the AskUserQuestion tool so the user picks with the arrow keys and enter, NEVER a typed-answer prose prompt. The recommended option is always FIRST and labeled "(Recommended)". Numbered text options are the fallback only when the tool is unavailable (headless or unattended runs). Never an open-ended stop. End with a
short DONE line: what was produced, the key numbers, and the natural next action
(or `BLOCKED, <reason>` with the ways forward offered via AskUserQuestion, recommended first).
Mirror the steps to the status bar: run `node .claude/hooks/lib/statusbar.cjs set task <step> <total> "<label>"` alongside each line and `node .claude/hooks/lib/statusbar.cjs done task` with the DONE line (pre-approved, best-effort, silent). At the very FIRST Say line also run `node .claude/hooks/lib/statusbar.cjs run-start <flow>`, ONLY when the user invoked this skill (directly or via plain-language routing); NEVER when executing inside another MDD flow, the outermost user-invoked run owns the elapsed timer and sub-runs must not touch it. Whenever stopping for user input (any WAITING ON YOU), first run `node .claude/hooks/lib/statusbar.cjs pause` so waiting time never counts as run time; the timer resumes automatically on the next `set` after the answer. When the run completes, the freezing `done <flow>`/`run-done` call PRINTS `MDD <run> completed in <elapsed>`: repeat that line VERBATIM as the very LAST user-visible line of the run, after everything else in the DONE block, always. Task checklist, always: at run start create the session task list (TodoWrite / the native task tool) with one entry per step of this skill, named exactly like the Say lines; mark the current entry in_progress and check each one off AT the moment its step completes, so the full plan, what is done, and what is running are visible the whole run. Same ownership rule as the timer: the user-invoked wrapper creates the list; a skill executing inside another MDD flow NEVER creates or replaces it, the wrapper's list already carries that work as an entry. Micro-status: the checklist is the broad strokes; the status bar label is the LIVE one. Between Say lines, refresh it (`set <flow> <N> <T> "<msg>"`, same phase numbers) every time the concrete action changes: dispatching agents, reading a file, writing a specific file, running the suite, gate iteration K, waiting on a command. Present tense, specific, short (under ~48 chars), e.g. "writing tests/auth.test.ts", "suite run 2, 3 red", "wiring routes/session.ts". A label that sits unchanged through many actions reads as hung; the set call is near-free, refresh it liberally.
