---
name: note
description: Manage the append-only notes log in the MDD session brief. Add a durable working note, list the current notes, or clear them. Invoke with /note followed by the text, or "note list" / "note clear".
disable-model-invocation: true
user-invocable: true
argument-hint: "[note text | list | clear]"
arguments: [arg]
---

Run `node .claude/hooks/lib/mdd-ensure.cjs` first, before anything else. It creates `.mdd` and its essential files if missing, and is a silent no-op otherwise.

Manage the notes log in `.mdd/.startup.md` (the append-only zone below the `## Notes`
divider). This is the disk-is-memory scratchpad that survives compaction and greets
the next session.

- **Add** (default): append `$arg` as a dated one-line entry below the `## Notes`
  divider. Never touch the auto-generated zone above the divider (that belongs to
  /status). A good note is durable and specific: "staging DB is the one named
  prod_replica", not "working on auth".
- **`list`**: print the current notes.
- **`clear`**: remove all entries below the divider, after confirming with the user.

Keep notes to genuine working memory: a decision made, a gotcha hit ("tried X, broke
Y, use Z"), a thing to pick up next. Anything durable and project-level about how the
code works belongs in a feature doc or a rule, not here.

## Messaging

Print one plain `[note] <what is happening>` line when starting (and at each later
stage of this flow), then work silently. Any question to the user is a
`WAITING ON YOU` block with numbered options, never an open-ended stop. End with a
short DONE line: what was produced, the key numbers, and the natural next action
(or `BLOCKED, <reason>` with numbered options).
Mirror the steps to the status bar: run `node .claude/hooks/lib/statusbar.cjs set note <step> <total> "<label>"` alongside each line and `node .claude/hooks/lib/statusbar.cjs done note` with the DONE line (pre-approved, best-effort, silent).
