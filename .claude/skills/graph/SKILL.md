---
name: graph
description: Show the cross-feature dependency map plus initiative/wave hierarchy and ops-runbook health, flagging broken, risky, task, and orphan dependencies. Read-only, saves the graph. Invoke with /graph.
disable-model-invocation: true
user-invocable: true
allowed-tools: "Read, Grep, Glob, Write"
---

Render the dependency picture and flag its problems.

## G1, build the graph
Read all `.mdd/docs/*.md` (including archive), extract `id`, `title`, `status`,
`depends_on`, and build a directed graph where A -> B means A depends on B. If
`.mdd/initiatives/` exists, also build the initiative -> wave -> feature-doc hierarchy.

## G2, detect issues
- Broken: a doc depends on a deprecated or archived feature.
- Risky: a `complete` feature depends on an `in_progress` or `draft` one.
- Task dependency: a feature doc lists a `type: task` doc in depends_on. Tasks are one-off and frozen, carry no ongoing contract, remove the id and move the relationship to prose.
- Orphan: no depends_on and nothing depends on it.
- Wave/initiative: a wave pointing at a nonexistent feature doc, a wave depending on a wave in another initiative (unsupported), or a feature complete in a wave with no doc.

## G3, render and save
Show the dependencies (A -> B), the orphans, and the issues with their severity. Append
the initiative/wave hierarchy with per-wave completion counts if initiatives exist, and
an ops-runbooks section (services, regions, last-runop health) if `.mdd/ops/` has files.
Save the whole thing to `.mdd/audits/graph-<date>.md`. Graph reports, it does not fix; it
overlaps `/connect` (which writes the persistent map) but this one is the on-demand
read with issue detection.

## Messaging

Print one plain `[graph] <what is happening>` line when starting (and at each later
stage of this flow), then work silently. Any question to the user is a
`WAITING ON YOU` line, with the choices presented through the AskUserQuestion tool so the user picks with the arrow keys and enter, NEVER a typed-answer prose prompt. The recommended option is always FIRST and labeled "(Recommended)". Numbered text options are the fallback only when the tool is unavailable (headless or unattended runs). Never an open-ended stop. End with a
short DONE line: what was produced, the key numbers, and the natural next action
(or `BLOCKED, <reason>` with the ways forward offered via AskUserQuestion, recommended first).
Mirror the steps to the status bar: run `node .claude/hooks/lib/statusbar.cjs set graph <step> <total> "<label>"` alongside each line and `node .claude/hooks/lib/statusbar.cjs done graph` with the DONE line (pre-approved, best-effort, silent). At the very FIRST Say line also run `node .claude/hooks/lib/statusbar.cjs run-start <flow>`, ONLY when the user invoked this skill (directly or via plain-language routing); NEVER when executing inside another MDD flow, the outermost user-invoked run owns the elapsed timer and sub-runs must not touch it. Whenever stopping for user input (any WAITING ON YOU), first run `node .claude/hooks/lib/statusbar.cjs pause` so waiting time never counts as run time; the timer resumes automatically on the next `set` after the answer. When the run completes, the freezing `done <flow>`/`run-done` call PRINTS `MDD <run> completed in <elapsed>`: repeat that line VERBATIM as the very LAST user-visible line of the run, after everything else in the DONE block, always. Task checklist, always: at run start create the session task list (TodoWrite / the native task tool) with one entry per step of this skill, named exactly like the Say lines; mark the current entry in_progress and check each one off AT the moment its step completes, so the full plan, what is done, and what is running are visible the whole run. Same ownership rule as the timer: the user-invoked wrapper creates the list; a skill executing inside another MDD flow NEVER creates or replaces it, the wrapper's list already carries that work as an entry. Micro-status: the checklist is the broad strokes; the status bar label is the LIVE one. Between Say lines, refresh it (`set <flow> <N> <T> "<msg>"`, same phase numbers) every time the concrete action changes: dispatching agents, reading a file, writing a specific file, running the suite, gate iteration K, waiting on a command. Present tense, specific, short (under ~48 chars), e.g. "writing tests/auth.test.ts", "suite run 2, 3 red", "wiring routes/session.ts". A label that sits unchanged through many actions reads as hung; the set call is near-free, refresh it liberally.
