---
name: update
description: Resync a feature doc with code that changed since the last session. Diffs the doc against its source, rewrites only the affected sections, preserves known_issues and dependencies, appends test skeletons for new behaviors, and clears the drift flag. Invoke with /update followed by the doc id.
disable-model-invocation: true
user-invocable: true
argument-hint: "[feature doc id]"
arguments: [id]
---

Run `node .claude/hooks/lib/mdd-ensure.cjs` first, before anything else. It creates `.mdd` and its essential files if missing, and is a silent no-op otherwise.

Resync feature doc: $id

The full reconciliation the drift sentinel points to when an inline patch is not enough.

## U1, load
Find and read `.mdd/docs/$id.md` (accept `04` or `04-content-builder`). If not found,
list the docs and ask which.

## U2, read the source
Read every file in `source_files`. A missing file is a broken reference, ask the user
for the new path before continuing.

## U3, diff doc vs code
Compare what the doc says against what the code does: new functions/endpoints/exports
not in the doc, removed or renamed things the doc still mentions, changed model fields,
changed business rules, new edge cases visible in error handling. Write findings to
`.mdd/audits/update-notes-$id-<date>.md`, not into memory.

## U4, present (gate)
Show what was added, removed, and changed since `last_synced`, and which doc sections
need updating. Ask: proceed, review findings first, or cancel. Wait for confirmation.

## U5, rewrite only what changed
Rewrite ONLY the drifted sections. Preserve `known_issues` (append-only, never drop),
`depends_on` (add only, never remove without asking), and any still-accurate prose.
Then update frontmatter: `last_synced: today`, ask whether to change `status`, update
`phase`, and if the doc has no `path`, offer to add one (insert between `tags` and
`known_issues`).

## U6, test skeletons
For any NEW documented behavior, append test skeleton entries to the existing test
file, never modifying existing test implementations. Remove `$id` from `.mdd/.drift`.
(The connections map is regenerated on its own by the connections-sync hook when the
doc is written, no manual rebuild needed.) Report the sections rewritten,
the new skeletons, and the branch. If the update reveals the feature has grown into two,
suggest splitting rather than letting one doc sprawl.

## Messaging

Print one plain `[update] <what is happening>` line when starting (and at each later
stage of this flow), then work silently. Any question to the user is a
`WAITING ON YOU` block with numbered options, never an open-ended stop. End with a
short DONE line: what was produced, the key numbers, and the natural next action
(or `BLOCKED, <reason>` with numbered options).
Mirror the steps to the status bar: run `node .claude/hooks/lib/statusbar.cjs set update <step> <total> "<label>"` alongside each line and `node .claude/hooks/lib/statusbar.cjs done update` with the DONE line (pre-approved, best-effort, silent).
