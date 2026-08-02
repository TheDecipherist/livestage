---
name: update-op
description: Edit an existing deployment runbook. Re-asks the ops questions with current values pre-filled, shows a diff, and rewrites only changed sections while preserving live service health data and known issues. Invoke with /update-op followed by the slug.
disable-model-invocation: true
user-invocable: true
argument-hint: "[runbook slug]"
arguments: [slug]
---

Run `node .claude/hooks/lib/mdd-ensure.cjs` first, before anything else. It creates `.mdd` and its essential files if missing, and is a silent no-op otherwise.

Edit runbook: $slug

## UO1, load
Require the slug. Find it project-first (`.mdd/ops/$slug.md`) then global
(`~/.claude/ops/$slug.md`), noting scope; hard stop if neither exists.

## UO2, re-ask
Re-present the ops questions with the current values as defaults. Accept unchanged, take
new values where given. Show a diff summary of what changed (regions added, images bumped,
gate behavior changed) and ask to apply.

## UO3, rewrite
Rewrite only the changed sections. Preserve `known_issues` (never drop without asking) and
each service's live `status` and `last_checked` (that is runtime data, not config). Set
`last_synced: today`, and drop `status` back to `draft` if it was `complete` and the change
was structural. Report the sections rewritten.

## Messaging

Print one plain `[update-op] <what is happening>` line when starting (and at each later
stage of this flow), then work silently. Any question to the user is a
`WAITING ON YOU` block with numbered options, never an open-ended stop. End with a
short DONE line: what was produced, the key numbers, and the natural next action
(or `BLOCKED, <reason>` with numbered options).
Mirror the steps to the status bar: run `node .claude/hooks/lib/statusbar.cjs set update-op <step> <total> "<label>"` alongside each line and `node .claude/hooks/lib/statusbar.cjs done update-op` with the DONE line (pre-approved, best-effort, silent).
