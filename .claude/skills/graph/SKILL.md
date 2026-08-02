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
`WAITING ON YOU` block with numbered options, never an open-ended stop. End with a
short DONE line: what was produced, the key numbers, and the natural next action
(or `BLOCKED, <reason>` with numbered options).
Mirror the steps to the status bar: run `node .claude/hooks/lib/statusbar.cjs set graph <step> <total> "<label>"` alongside each line and `node .claude/hooks/lib/statusbar.cjs done graph` with the DONE line (pre-approved, best-effort, silent).
