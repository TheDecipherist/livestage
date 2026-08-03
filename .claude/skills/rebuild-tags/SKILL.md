---
name: rebuild-tags
description: Generate tags for any feature doc or ops runbook missing them, so the session brief's auto-suggest can match a prompt to a feature. Safe to re-run (skips docs that already have tags unless --force). Rebuilds the brief after. Invoke with /rebuild-tags.
disable-model-invocation: true
user-invocable: true
argument-hint: "[--force]"
arguments: [flag]
---

Run `node .claude/hooks/lib/mdd-ensure.cjs` first, before anything else. It creates `.mdd` and its essential files if missing, and is a silent no-op otherwise.

Generate missing tags across the workspace. This is the migration path for older
projects onto the tag system.

## RT1, inventory
Glob `.mdd/docs/*.md` and `.mdd/ops/*.md` (excluding `archive/`). For each, check for a
`tags:` field. Present an inventory (which have tags, which do not) and the count
needing tags. If zero need tags and `--force` was not passed, skip to RT3.

## RT2, generate
For each doc missing `tags:` (or all docs if `$flag` is `--force`, showing old to new):
read its frontmatter and the first paragraph of `## Purpose`, then generate 4 to 8
domain-concept keywords. Use title words, purpose concepts, platform and technology
names, key system names, and operation types. Do NOT use file paths, generic words like
"feature" or "system", or version numbers. For ops docs lean on platform, services,
environment, and operation type; for feature docs on domain, technology, and feature
name. Write `tags:` into the frontmatter, inserted before `known_issues:`. Report one
line per doc.

## RT3, rebuild
Rebuild `.mdd/.startup.md` (the /status logic) so every feature and ops line shows
its tags. The connections map is refreshed on its own by the connections-sync hook as
the docs are rewritten, no manual rebuild needed.

## RT4, report
Docs processed, tags generated, tags skipped, and a sample of the new startup feature
lines.

## Messaging

Print one plain `[rebuild-tags] <what is happening>` line when starting (and at each later
stage of this flow), then work silently. Any question to the user is a
`WAITING ON YOU` line, with the choices presented through the AskUserQuestion tool so the user picks with the arrow keys and enter, NEVER a typed-answer prose prompt. The recommended option is always FIRST and labeled "(Recommended)". Numbered text options are the fallback only when the tool is unavailable (headless or unattended runs). Never an open-ended stop. End with a
short DONE line: what was produced, the key numbers, and the natural next action
(or `BLOCKED, <reason>` with the ways forward offered via AskUserQuestion, recommended first).
Mirror the steps to the status bar: run `node .claude/hooks/lib/statusbar.cjs set rebuild-tags <step> <total> "<label>"` alongside each line and `node .claude/hooks/lib/statusbar.cjs done rebuild-tags` with the DONE line (pre-approved, best-effort, silent). At the very FIRST Say line also run `node .claude/hooks/lib/statusbar.cjs run-start <flow>`, ONLY when the user invoked this skill (directly or via plain-language routing); NEVER when executing inside another MDD flow, the outermost user-invoked run owns the elapsed timer and sub-runs must not touch it. Whenever stopping for user input (any WAITING ON YOU), first run `node .claude/hooks/lib/statusbar.cjs pause` so waiting time never counts as run time; the timer resumes automatically on the next `set` after the answer. When the run completes, the freezing `done <flow>`/`run-done` call PRINTS `MDD <run> completed in <elapsed>`: repeat that line VERBATIM as the very LAST user-visible line of the run, after everything else in the DONE block, always. Task checklist, always: at run start create the session task list (TodoWrite / the native task tool) with one entry per step of this skill, named exactly like the Say lines; mark the current entry in_progress and check each one off AT the moment its step completes, so the full plan, what is done, and what is running are visible the whole run. Same ownership rule as the timer: the user-invoked wrapper creates the list; a skill executing inside another MDD flow NEVER creates or replaces it, the wrapper's list already carries that work as an entry. Micro-status: the checklist is the broad strokes; the status bar label is the LIVE one. Between Say lines, refresh it (`set <flow> <N> <T> "<msg>"`, same phase numbers) every time the concrete action changes: dispatching agents, reading a file, writing a specific file, running the suite, gate iteration K, waiting on a command. Present tense, specific, short (under ~48 chars), e.g. "writing tests/auth.test.ts", "suite run 2, 3 red", "wiring routes/session.ts". A label that sits unchanged through many actions reads as hung; the set call is near-free, refresh it liberally.
