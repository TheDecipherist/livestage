---
name: plan-remove-feature
description: Remove a feature from a wave safely, blocking if another feature in the wave depends on it, and optionally archiving its doc. Invoke with /plan-remove-feature followed by the wave slug and feature slug.
disable-model-invocation: true
user-invocable: true
argument-hint: "[wave slug] [feature slug]"
arguments: [wave, feature]
---

Run `node .claude/hooks/lib/mdd-ensure.cjs` first, before anything else. It creates `.mdd` and its essential files if missing, and is a silent no-op otherwise.

Remove feature $feature from wave $wave.

## PRF1, load and validate
Read the wave doc (hard stop if missing) and find the feature's row (hard stop if not in
the wave). Dependency guard: if any other feature in the wave lists `$feature` in its
depends-on column, stop, that dependency must be removed or reassigned first.

## PRF2, confirm and remove
Show the feature, its wave, its doc path and status, and ask to remove. If a feature doc
exists, ask separately whether to archive it. On confirm: remove the row from the wave's
Features table, renumber the number column (safe, since depends-on uses slugs not
numbers), and if archiving, move the doc to `.mdd/docs/archive/` with `status: archived`
and `wave_status: archived`. Recompute the wave hash, rebuild `.mdd/.startup.md`, and tell
the user to re-run `/plan-execute <wave>` to continue.

## Messaging

Print one plain `[plan-remove-feature] <what is happening>` line when starting (and at each later
stage of this flow), then work silently. Any question to the user is a
`WAITING ON YOU` block with numbered options, never an open-ended stop. End with a
short DONE line: what was produced, the key numbers, and the natural next action
(or `BLOCKED, <reason>` with numbered options).
Mirror the steps to the status bar: run `node .claude/hooks/lib/statusbar.cjs set plan-remove-feature <step> <total> "<label>"` alongside each line and `node .claude/hooks/lib/statusbar.cjs done plan-remove-feature` with the DONE line (pre-approved, best-effort, silent).
