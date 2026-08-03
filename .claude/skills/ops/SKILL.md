---
name: ops
description: Create a deployment runbook, or list existing ones. Captures regions, services, health checks, and a canary-gated deployment strategy into a structured doc that /runop can execute. Credentials are recorded as env var names only, never values. Invoke with /ops followed by a description, or /ops list.
disable-model-invocation: true
user-invocable: true
argument-hint: "[description, or 'list']"
arguments: [description]
---

Run `node .claude/hooks/lib/mdd-ensure.cjs` first, before anything else. It creates `.mdd` and its essential files if missing, and is a silent no-op otherwise.

Create a deployment runbook, or list them if `$description` is exactly `list`.

## ops list
Glob `~/.claude/ops/*.md` (global) and `.mdd/ops/*.md` (project, excluding archive).
For each, read `id`, `title`, `platform`, `status`, and the latest `last_checked` across
its services. Show a unified list grouped by scope, with last-run status. Omit an empty
scope. Done.

## OP1, scope, slug, collision
Ask where the runbook lives: project (`.mdd/ops/<slug>.md`, this project) or global
(`~/.claude/ops/<slug>.md`, reusable, but no access to project `.env` or paths). Derive a
slug from the description (lowercase, hyphens, drop filler: "deploy swarmk to dokploy" ->
`swarmk-dokploy`). Collision: a project op cannot share a name with an existing global op
(hard stop). If the target already exists, tell the user to use `/update-op` or
`/runop`, and stop.

## OP2, questions (one interaction)
Ask: what this deployment is; the platform (dokploy/docker-hub/vercel/github-actions/
manual); every service (name, image, port or none, exact health-check command); every
region (slug, host, platform, deploy order where 1 is canary); the strategy (sequential
or parallel, the gate between regions: health_check/manual/none); canary-failure behavior
(stop/skip_region/rollback, auto-rollback yes/no); how deployment is triggered; the
credentials needed as ENV VAR NAMES ONLY and where each is stored; any MCP servers needed
during deploy; and the target environments.

## OP3, write
Write the runbook with frontmatter carrying `type: ops`, platform, environments,
`deployment_strategy` (order, gate, on_gate_failure, rollback_on_failure), `regions` (each
with slug, host, platform, deploy_order, role), `services` (each with slug, image, port,
health_check, and a per-region block of image/status/last_checked), status, last_synced,
tags, known_issues. Then the seven mandatory sections: Overview, Services and Ports,
Environment Targets, Webhooks and Triggers, Credentials and API Keys (a table of name ->
env var -> where stored, NEVER a value), MCP Servers, Deployment Procedure (ordered steps,
each with a name, an exact action command, and a verify command that exits 0 on success),
and Rollback Plan (specific actionable steps, not "revert the commit").

## OP4, next
Point the user to `/runop <slug>` to execute and `/update-op <slug>` to edit.

## Messaging

Print one plain `[ops] <what is happening>` line when starting (and at each later
stage of this flow), then work silently. Any question to the user is a
`WAITING ON YOU` line, with the choices presented through the AskUserQuestion tool so the user picks with the arrow keys and enter, NEVER a typed-answer prose prompt. The recommended option is always FIRST and labeled "(Recommended)". Numbered text options are the fallback only when the tool is unavailable (headless or unattended runs). Never an open-ended stop. End with a
short DONE line: what was produced, the key numbers, and the natural next action
(or `BLOCKED, <reason>` with the ways forward offered via AskUserQuestion, recommended first).
Mirror the steps to the status bar: run `node .claude/hooks/lib/statusbar.cjs set ops <step> <total> "<label>"` alongside each line and `node .claude/hooks/lib/statusbar.cjs done ops` with the DONE line (pre-approved, best-effort, silent). At the very FIRST Say line also run `node .claude/hooks/lib/statusbar.cjs run-start <flow>`, ONLY when the user invoked this skill (directly or via plain-language routing); NEVER when executing inside another MDD flow, the outermost user-invoked run owns the elapsed timer and sub-runs must not touch it. Whenever stopping for user input (any WAITING ON YOU), first run `node .claude/hooks/lib/statusbar.cjs pause` so waiting time never counts as run time; the timer resumes automatically on the next `set` after the answer. When the run completes, the freezing `done <flow>`/`run-done` call PRINTS `MDD <run> completed in <elapsed>`: repeat that line VERBATIM as the very LAST user-visible line of the run, after everything else in the DONE block, always. Task checklist, always: at run start create the session task list (TodoWrite / the native task tool) with one entry per step of this skill, named exactly like the Say lines; mark the current entry in_progress and check each one off AT the moment its step completes, so the full plan, what is done, and what is running are visible the whole run. Same ownership rule as the timer: the user-invoked wrapper creates the list; a skill executing inside another MDD flow NEVER creates or replaces it, the wrapper's list already carries that work as an entry. Micro-status: the checklist is the broad strokes; the status bar label is the LIVE one. Between Say lines, refresh it (`set <flow> <N> <T> "<msg>"`, same phase numbers) every time the concrete action changes: dispatching agents, reading a file, writing a specific file, running the suite, gate iteration K, waiting on a command. Present tense, specific, short (under ~48 chars), e.g. "writing tests/auth.test.ts", "suite run 2, 3 red", "wiring routes/session.ts". A label that sits unchanged through many actions reads as hung; the set call is near-free, refresh it liberally.
