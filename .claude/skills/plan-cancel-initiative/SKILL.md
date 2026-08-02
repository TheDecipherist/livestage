---
name: plan-cancel-initiative
description: Cancel an initiative. Sets its status to cancelled, optionally archives its wave docs, and optionally flags its feature docs with a known-issues warning. Never deletes feature docs. Invoke with /plan-cancel-initiative followed by the slug.
disable-model-invocation: true
user-invocable: true
argument-hint: "[initiative slug]"
arguments: [slug]
---

Run `node .claude/hooks/lib/mdd-ensure.cjs` first, before anything else. It creates `.mdd` and its essential files if missing, and is a silent no-op otherwise.

Cancel initiative $slug.

## PCI1, load
Read `initiatives/$slug.md` (hard stop if missing). Count its waves and their statuses,
and the feature docs carrying `initiative: $slug`.

## PCI2, confirm
Show the initiative status, wave breakdown, and feature-doc count, and ask to cancel.

## PCI3, cancel
On yes: set `status: cancelled` in the initiative and recompute its hash. Ask separately
whether to archive the wave docs (move to `.mdd/waves/archive/`) and whether to flag the
feature docs (add to each one's `known_issues`: "initiative <slug> was cancelled, review
whether this feature is still needed"). Never delete feature docs. Rebuild
`.mdd/.startup.md` and report what was archived and flagged.

## Messaging

Print one plain `[plan-cancel-initiative] <what is happening>` line when starting (and at each later
stage of this flow), then work silently. Any question to the user is a
`WAITING ON YOU` block with numbered options, never an open-ended stop. End with a
short DONE line: what was produced, the key numbers, and the natural next action
(or `BLOCKED, <reason>` with numbered options).
Mirror the steps to the status bar: run `node .claude/hooks/lib/statusbar.cjs set plan-cancel-initiative <step> <total> "<label>"` alongside each line and `node .claude/hooks/lib/statusbar.cjs done plan-cancel-initiative` with the DONE line (pre-approved, best-effort, silent).
