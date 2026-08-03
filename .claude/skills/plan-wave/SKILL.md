---
name: plan-wave
description: Plan a wave inside an initiative, gated on the initiative being unedited (hash match) and its open questions answered. Guided or blank-template, writes the wave doc with a content hash and registers it in the initiative. Invoke with /plan-wave followed by the wave slug.
disable-model-invocation: true
user-invocable: true
argument-hint: "[wave slug, e.g. auth-system-wave-2]"
arguments: [wave]
---

Run `node .claude/hooks/lib/mdd-ensure.cjs` first, before anything else. It creates `.mdd` and its essential files if missing, and is a silent no-op otherwise.

Plan wave: $wave

## PW1, load and validate
Branch to `feat/<wave>` if on main (the hook enforces no-main). Require the wave slug.
Derive the initiative slug (everything before `-wave-N`) and read
`initiatives/<slug>.md` fresh. Hard stops, each with a clear reason:
- Initiative does not exist.
- Hash mismatch: the initiative was manually edited since last sync, run `/plan-sync` first.
- Open-questions gate: any unchecked `- [ ]` in Open Product Questions, quote them back, they must be answered before planning a wave.
- Depends-on gate: if this wave's prior wave exists and is not `complete`, stop.
Then summarize the initiative context (title, overview, wave count, which are done).

## PW2, mode
Guide me or template, same as plan-initiative. Template writes a blank wave doc and
points the user to `/plan-sync` then `/plan-execute`.

## PW3, questions
In one interaction: does the initiative's demo-state need sharpening for this wave; the
features needed to reach it (name plus one line each); any intra-wave feature
dependencies; any open research before building.

## PW4, write
Write `.mdd/waves/<wave>.md` with frontmatter (id, title "Wave N: ...", initiative,
`initiative_version` = the initiative's current version, `status: planned`, depends_on,
demo_state, created, empty hash) and sections: Demo-State (not complete until
demonstrable) and a Features table (number, feature, doc, status planned, depends-on).
Compute and write its hash. Add this wave's row to the initiative's Waves table, bump the
initiative `version`, and recompute the initiative hash. Rebuild `.mdd/.startup.md`.

## PW5, chain
Offer to plan the next wave now.

## Messaging

Print one plain `[plan-wave] <what is happening>` line when starting (and at each later
stage of this flow), then work silently. Any question to the user is a
`WAITING ON YOU` line, with the choices presented through the AskUserQuestion tool so the user picks with the arrow keys and enter, NEVER a typed-answer prose prompt. The recommended option is always FIRST and labeled "(Recommended)". Numbered text options are the fallback only when the tool is unavailable (headless or unattended runs). Never an open-ended stop. End with a
short DONE line: what was produced, the key numbers, and the natural next action
(or `BLOCKED, <reason>` with the ways forward offered via AskUserQuestion, recommended first).
Mirror the steps to the status bar: run `node .claude/hooks/lib/statusbar.cjs set plan-wave <step> <total> "<label>"` alongside each line and `node .claude/hooks/lib/statusbar.cjs done plan-wave` with the DONE line (pre-approved, best-effort, silent). At the very FIRST Say line also run `node .claude/hooks/lib/statusbar.cjs run-start <flow>`, ONLY when the user invoked this skill (directly or via plain-language routing); NEVER when executing inside another MDD flow, the outermost user-invoked run owns the elapsed timer and sub-runs must not touch it. Whenever stopping for user input (any WAITING ON YOU), first run `node .claude/hooks/lib/statusbar.cjs pause` so waiting time never counts as run time; the timer resumes automatically on the next `set` after the answer. When the run completes, the freezing `done <flow>`/`run-done` call PRINTS `MDD <run> completed in <elapsed>`: repeat that line VERBATIM as the very LAST user-visible line of the run, after everything else in the DONE block, always. Task checklist, always: at run start create the session task list (TodoWrite / the native task tool) with one entry per step of this skill, named exactly like the Say lines; mark the current entry in_progress and check each one off AT the moment its step completes, so the full plan, what is done, and what is running are visible the whole run. Same ownership rule as the timer: the user-invoked wrapper creates the list; a skill executing inside another MDD flow NEVER creates or replaces it, the wrapper's list already carries that work as an entry. Micro-status: the checklist is the broad strokes; the status bar label is the LIVE one. Between Say lines, refresh it (`set <flow> <N> <T> "<msg>"`, same phase numbers) every time the concrete action changes: dispatching agents, reading a file, writing a specific file, running the suite, gate iteration K, waiting on a command. Present tense, specific, short (under ~48 chars), e.g. "writing tests/auth.test.ts", "suite run 2, 3 red", "wiring routes/session.ts". A label that sits unchanged through many actions reads as hung; the set call is near-free, refresh it liberally.
