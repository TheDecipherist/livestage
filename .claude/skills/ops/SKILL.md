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
`WAITING ON YOU` block with numbered options, never an open-ended stop. End with a
short DONE line: what was produced, the key numbers, and the natural next action
(or `BLOCKED, <reason>` with numbered options).
Mirror the steps to the status bar: run `node .claude/hooks/lib/statusbar.cjs set ops <step> <total> "<label>"` alongside each line and `node .claude/hooks/lib/statusbar.cjs done ops` with the DONE line (pre-approved, best-effort, silent).
