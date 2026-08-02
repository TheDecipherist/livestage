---
name: deprecate
description: Retire a feature doc safely. Flags every dependent, sets status deprecated, archives the doc, asks separately before deleting source or test files, and rebuilds the brief. Never auto-deletes code. Invoke with /deprecate followed by the doc id.
disable-model-invocation: true
user-invocable: true
argument-hint: "[feature doc id]"
arguments: [id]
---

Run `node .claude/hooks/lib/mdd-ensure.cjs` first, before anything else. It creates `.mdd` and its essential files if missing, and is a silent no-op otherwise.

Deprecate feature doc: $id

Retiring a feature is a graph operation, not a delete. The danger is orphaning the docs
that depend on this one.

## D1, load and impact
Find and read the target doc. Scan all other `.mdd/docs/*.md` for any that list `$id`
in `depends_on`. Build the impact list, and read the doc's `source_files` and
`test_files`.

## D2, present
Show what will happen (set `status: deprecated`, move to `.mdd/docs/archive/`), the
dependent docs, and the registered source and test files. Warn clearly if there are
dependents, deprecating a depended-on feature breaks their contract. Ask: proceed,
review dependents first, or cancel.

## D3, archive
On yes:
1. Set `status: deprecated` and `last_synced: today` in the doc.
2. Create `.mdd/docs/archive/` if needed and move the doc there. MDD never destroys history.
3. For each dependent, append to its `known_issues`: "<id> has been deprecated, review this dependency."
4. Ask SEPARATELY, never auto-delete: "Delete source files? (yes/no)" and "Delete test files? (yes/no)".
5. Rebuild `.mdd/.startup.md` (the /status logic). The connections map updates on its own, the connections-sync hook regenerates it when it sees the doc move to archive.

Report the archived path, how many dependents were flagged, and what was kept or deleted.

## Messaging

Print one plain `[deprecate] <what is happening>` line when starting (and at each later
stage of this flow), then work silently. Any question to the user is a
`WAITING ON YOU` block with numbered options, never an open-ended stop. End with a
short DONE line: what was produced, the key numbers, and the natural next action
(or `BLOCKED, <reason>` with numbered options).
Mirror the steps to the status bar: run `node .claude/hooks/lib/statusbar.cjs set deprecate <step> <total> "<label>"` alongside each line and `node .claude/hooks/lib/statusbar.cjs done deprecate` with the DONE line (pre-approved, best-effort, silent).
