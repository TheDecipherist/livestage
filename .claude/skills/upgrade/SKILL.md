---
name: upgrade
description: Batch-patch missing frontmatter fields (last_synced, status, phase, tags, path) across every feature doc without touching content. Infers sensible defaults, confirms the plan, and writes non-destructively. Safe to re-run. This is how untracked docs become in-sync in one pass. Invoke with /upgrade.
disable-model-invocation: true
user-invocable: true
allowed-tools: "Read, Grep, Glob, Write, Bash"
---

Run `node .claude/hooks/lib/mdd-ensure.cjs` first, before anything else. It creates `.mdd` and its essential files if missing, and is a silent no-op otherwise.

Bring older docs up to the current frontmatter schema without rewriting their content.
The migration path for docs that predate a field, or came from another project. Never
overwrites an existing field.

## UP1, inventory
Glob `.mdd/docs/*.md` (and archive). Read each doc's frontmatter only and build a table
of which of `last_synced`, `status`, `phase`, `tags`, `path` are missing per doc. If none
need anything, report and stop.

## UP2, infer defaults (do not ask per doc)
- last_synced: the last meaningful work date. Try `git log --format="%as" --follow -- <doc>` (most recent commit), else today.
- status: from an existing `phase` (all -> complete, implementation/6 -> in_progress, draft/1-3 -> draft); else from content (reverse-engineered -> complete, in archive/ -> deprecated, otherwise complete, since most pre-existing docs are finished).
- phase: complete -> all, in_progress -> implementation, draft -> documentation, deprecated -> deprecated.
- path: cannot be inferred from git, requires reading the doc's title and Purpose plus the other docs' `path` values for vocabulary. Propose a value, never write it silently, it goes in the plan for review.
- tags: do NOT generate here, note that `/rebuild-tags` populates them after.

## UP3, show the plan and confirm
Present the additions per doc (existing fields untouched), with the inferred path values
called out for review. Ask proceed / review each / cancel. On review-each, walk doc by
doc (accept/edit/skip).

## UP4, patch
For each doc, read the file, locate the frontmatter block, add ONLY the missing fields
(inserted before `known_issues` to keep canonical order), and write back preserving every
existing field and the body exactly. Write the user-confirmed `path`; leave `tags` for
rebuild-tags. Report per doc what was added or skipped.

## UP5, verify
Re-scan to confirm no doc is missing `last_synced` or `path`, rebuild `.mdd/.startup.md`,
regenerate `.mdd/connections.md` (the /connect logic), and report. Point the user to
`/rebuild-tags` for tags and `/scan` for the new drift picture.

## Messaging

Print one plain `[upgrade] <what is happening>` line when starting (and at each later
stage of this flow), then work silently. Any question to the user is a
`WAITING ON YOU` block with numbered options, never an open-ended stop. End with a
short DONE line: what was produced, the key numbers, and the natural next action
(or `BLOCKED, <reason>` with numbered options).
Mirror the steps to the status bar: run `node .claude/hooks/lib/statusbar.cjs set upgrade <step> <total> "<label>"` alongside each line and `node .claude/hooks/lib/statusbar.cjs done upgrade` with the DONE line (pre-approved, best-effort, silent).
