---
name: plan-sync
description: Reconcile manual edits to initiative and wave files. Compares each file's content hash to its stored hash, and for anything changed, bumps the initiative version or updates the wave hash and flags the completed waves and features that may now be out of date. Invoke with /plan-sync.
disable-model-invocation: true
user-invocable: true
allowed-tools: "Read, Grep, Glob, Write, Bash"
---

Run `node .claude/hooks/lib/mdd-ensure.cjs` first, before anything else. It creates `.mdd` and its essential files if missing, and is a silent no-op otherwise.

Reconcile hand-edited plan files. Initiative and wave docs carry a content hash; the
plan-wave and plan-execute gates refuse to run when a file's hash does not match its
content, because a manual edit may have invalidated completed work. This mode is how you
clear that.

## PS1, scan
Read every file in `.mdd/initiatives/` and `.mdd/waves/` (including archive). For each,
compute the hash of its content excluding the `hash:` line and compare to the stored
`hash:`. Build a change table: unchanged, changed, or new (empty stored hash).

## PS2, present
Show the change table and what each change will do: an initiative change bumps its
version, updates its hash, and flags completed waves whose `initiative_version` is now
behind; a wave change updates its hash and flags completed features in it; a new file
just gets its hash written. Ask apply / review each / cancel.

## PS3, apply
Initiative-first. For a changed initiative: increment `version`, rewrite `hash`, find its
`complete` waves whose `initiative_version` is below the new version, and offer to flip
them back to `in_progress` for review. For a changed wave: rewrite `hash`, and for each
`complete` feature in it, offer to add a `known_issues` note ("wave edited after this
feature completed, review for consistency"). For a new file: write the computed hash,
nothing else. Rebuild `.mdd/.startup.md` and report per-file what happened.

## Messaging

Print one plain `[plan-sync] <what is happening>` line when starting (and at each later
stage of this flow), then work silently. Any question to the user is a
`WAITING ON YOU` line, with the choices presented through the AskUserQuestion tool so the user picks with the arrow keys and enter, NEVER a typed-answer prose prompt. The recommended option is always FIRST and labeled "(Recommended)". Numbered text options are the fallback only when the tool is unavailable (headless or unattended runs). Never an open-ended stop. End with a
short DONE line: what was produced, the key numbers, and the natural next action
(or `BLOCKED, <reason>` with the ways forward offered via AskUserQuestion, recommended first).
Mirror the steps to the status bar: run `node .claude/hooks/lib/statusbar.cjs set plan-sync <step> <total> "<label>"` alongside each line and `node .claude/hooks/lib/statusbar.cjs done plan-sync` with the DONE line (pre-approved, best-effort, silent). At the very FIRST Say line also run `node .claude/hooks/lib/statusbar.cjs run-start <flow>`, ONLY when the user invoked this skill (directly or via plain-language routing); NEVER when executing inside another MDD flow, the outermost user-invoked run owns the elapsed timer and sub-runs must not touch it. Whenever stopping for user input (any WAITING ON YOU), first run `node .claude/hooks/lib/statusbar.cjs pause` so waiting time never counts as run time; the timer resumes automatically on the next `set` after the answer. When the run completes, the freezing `done <flow>`/`run-done` call PRINTS `MDD <run> completed in <elapsed>`: repeat that line VERBATIM as the very LAST user-visible line of the run, after everything else in the DONE block, always. Task checklist, always: at run start create the session task list (TodoWrite / the native task tool) with one entry per step of this skill, named exactly like the Say lines; mark the current entry in_progress and check each one off AT the moment its step completes, so the full plan, what is done, and what is running are visible the whole run. Same ownership rule as the timer: the user-invoked wrapper creates the list; a skill executing inside another MDD flow NEVER creates or replaces it, the wrapper's list already carries that work as an entry. Micro-status: the checklist is the broad strokes; the status bar label is the LIVE one. Between Say lines, refresh it (`set <flow> <N> <T> "<msg>"`, same phase numbers) every time the concrete action changes: dispatching agents, reading a file, writing a specific file, running the suite, gate iteration K, waiting on a command. Present tense, specific, short (under ~48 chars), e.g. "writing tests/auth.test.ts", "suite run 2, 3 red", "wiring routes/session.ts". A label that sits unchanged through many actions reads as hung; the set call is near-free, refresh it liberally.
