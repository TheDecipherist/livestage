---
name: task
description: Do a scoped piece of work that is not a full feature (a chore, a config change, a small refactor) while still recording it the MDD way. Produces a task-type doc that is frozen and never flagged as drifted. Invoke with /task followed by the description.
disable-model-invocation: true
user-invocable: true
argument-hint: "[task description]"
arguments: [task]
---

Run `node .claude/hooks/lib/mdd-ensure.cjs` first, before anything else. It creates `.mdd` and its essential files if missing, and is a silent no-op otherwise.

Do the task: $task

A task is work that has no ongoing behavior contract to protect: a dependency bump,
a build-config change, a rename, a one-off migration. It still gets a doc so the
history exists, but a lighter one.

## Flow
1. Branch first, never `main`.
2. Write a short doc to `.mdd/docs/NN-slug.md` with `type: task` and `status: done`
   in the frontmatter. Record what the task is, why, and which files it touched in
   `source_files`. A task doc has no `routes`/`models` contract to keep in sync.
3. Do the work. Standard gates still apply through the hooks (Branch Guard, the
   safety guards), but there is no Red/Green test cycle unless the task warrants one.
4. Set `last_synced` to today.

## Why type: task matters
A `type: task` doc is frozen: `/scan` never reports it as drifted, because there
is no living contract for the code to drift from. Use `task` for exactly that case,
and `build` when there is behavior to document and test. When in doubt, it is a
build.

## Messaging

Print one plain `[task] <what is happening>` line when starting (and at each later
stage of this flow), then work silently. Any question to the user is a
`WAITING ON YOU` block with numbered options, never an open-ended stop. End with a
short DONE line: what was produced, the key numbers, and the natural next action
(or `BLOCKED, <reason>` with numbered options).
Mirror the steps to the status bar: run `node .claude/hooks/lib/statusbar.cjs set task <step> <total> "<label>"` alongside each line and `node .claude/hooks/lib/statusbar.cjs done task` with the DONE line (pre-approved, best-effort, silent).
