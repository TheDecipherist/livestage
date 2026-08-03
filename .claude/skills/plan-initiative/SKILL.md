---
name: plan-initiative
description: Create a new MDD initiative, the top-level container for a multi-wave effort. Guided or blank-template, with slug collision handling and a content hash so later manual edits are detectable. Invoke with /plan-initiative.
disable-model-invocation: true
user-invocable: true
argument-hint: "[initiative title]"
arguments: [title]
---

Run `node .claude/hooks/lib/mdd-ensure.cjs` first, before anything else. It creates `.mdd` and its essential files if missing, and is a silent no-op otherwise.

Create an initiative: $title

An initiative is the top-level scope for a multi-wave build. It carries a content hash
so the plan system can detect manual edits later (see plan-sync). The Branch Guard hook
blocks main, so branch to `feat/init-<slug>` first if needed.

## PI1, mode
Ask: guide me (I ask questions and write the file) or template (a blank file to fill in).
On template: get a title, slugify, check for collision (an existing
`initiatives/<slug>.md` is a hard stop; if it has active feature docs, deprecate those
first; else offer overwrite), write the blank template with `version: 1` and an empty
`hash:`, tell the user to fill it and run `/plan-sync` then `/plan-wave`. On
guide, continue.

## PI2, questions
In one interaction: title; description (what it delivers and why); rough wave count (2
to 6 typical); for each wave a name and a one-sentence demo-state (what the user can DO
when it is done); and what is still undecided that could affect architecture (these
become unchecked open product questions).

## PI3, write
Slugify the title (lowercase, hyphens). Collision check as above. Write
`.mdd/initiatives/<slug>.md` with frontmatter (id, title, `status: active`, `version: 1`,
empty `hash:`, created) and sections: Overview, Open Product Questions (as `- [ ]`
items), and a Waves table (wave, file, demo-state, status planned). Compute the content
hash (of everything except the hash line) and write it. Rebuild `.mdd/.startup.md`.

## PI4, chain
Show the doc and offer to plan Wave 1 now (run plan-wave inline for `<slug>-wave-1`) or
later.

## Messaging

Print one plain `[plan-initiative] <what is happening>` line when starting (and at each later
stage of this flow), then work silently. Any question to the user is a
`WAITING ON YOU` line, with the choices presented through the AskUserQuestion tool so the user picks with the arrow keys and enter, NEVER a typed-answer prose prompt. The recommended option is always FIRST and labeled "(Recommended)". Numbered text options are the fallback only when the tool is unavailable (headless or unattended runs). Never an open-ended stop. End with a
short DONE line: what was produced, the key numbers, and the natural next action
(or `BLOCKED, <reason>` with the ways forward offered via AskUserQuestion, recommended first).
Mirror the steps to the status bar: run `node .claude/hooks/lib/statusbar.cjs set plan-initiative <step> <total> "<label>"` alongside each line and `node .claude/hooks/lib/statusbar.cjs done plan-initiative` with the DONE line (pre-approved, best-effort, silent). At the very FIRST Say line also run `node .claude/hooks/lib/statusbar.cjs run-start <flow>`, ONLY when the user invoked this skill (directly or via plain-language routing); NEVER when executing inside another MDD flow, the outermost user-invoked run owns the elapsed timer and sub-runs must not touch it. Whenever stopping for user input (any WAITING ON YOU), first run `node .claude/hooks/lib/statusbar.cjs pause` so waiting time never counts as run time; the timer resumes automatically on the next `set` after the answer. When the run completes, the freezing `done <flow>`/`run-done` call PRINTS `MDD <run> completed in <elapsed>`: repeat that line VERBATIM as the very LAST user-visible line of the run, after everything else in the DONE block, always. Task checklist, always: at run start create the session task list (TodoWrite / the native task tool) with one entry per step of this skill, named exactly like the Say lines; mark the current entry in_progress and check each one off AT the moment its step completes, so the full plan, what is done, and what is running are visible the whole run. Same ownership rule as the timer: the user-invoked wrapper creates the list; a skill executing inside another MDD flow NEVER creates or replaces it, the wrapper's list already carries that work as an entry. Micro-status: the checklist is the broad strokes; the status bar label is the LIVE one. Between Say lines, refresh it (`set <flow> <N> <T> "<msg>"`, same phase numbers) every time the concrete action changes: dispatching agents, reading a file, writing a specific file, running the suite, gate iteration K, waiting on a command. Present tense, specific, short (under ~48 chars), e.g. "writing tests/auth.test.ts", "suite run 2, 3 red", "wiring routes/session.ts". A label that sits unchanged through many actions reads as hung; the set call is near-free, refresh it liberally.
