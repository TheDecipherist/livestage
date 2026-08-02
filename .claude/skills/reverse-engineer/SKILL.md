---
name: reverse-engineer
description: Generate or regenerate an MDD feature doc from existing source code, inferring purpose, models, routes, and rules in parallel, then disclosing what could not be inferred. Invoke with /reverse-engineer (or /reverse), optionally with a path or feature id.
disable-model-invocation: true
user-invocable: true
argument-hint: "[path or feature id]"
arguments: [target]
---

Run `node .claude/hooks/lib/mdd-ensure.cjs` first, before anything else. It creates `.mdd` and its essential files if missing, and is a silent no-op otherwise.

Document existing code as an MDD feature doc: $target

The one place a doc is written AFTER the code. That inversion is a limitation, not the
norm, and it must be disclosed.

## R1, scope
If `$target` matches an existing doc, load it for comparison (regenerate mode). If it is
a file path, that file is the source (new-doc mode). If empty, scan `src/` and
cross-reference every file against the `source_files` across all docs, then ask which of
the unregistered files to document.

## R2, read the source (parallel over 4+ files)
Three or fewer files: read directly. Four or more: batch into up to three explore agents,
each reading a subset and returning structured inference (not raw files), never writing.
Per file infer: purpose (what problem it solves), data models (interfaces, types,
schemas), API routes (method and path), business rules (validation, state transitions),
dependencies (project imports), and edge cases (error handling, guards). Fall back to
direct reads if an agent fails, synthesize in the main thread.

## R3, draft
Read `.mdd/00-frontmatter-spec.md` for the schema. Draft a full feature doc following the
build Phase 3 structure, with `last_synced: today`, `status: draft` (business intent is
inferred, not confirmed), `phase: reverse-engineered`, and inferred `tags` (concepts, not
file paths). In regenerate mode, show the existing doc against the new draft section by
section and ask: merge, keep existing, or show full diff. In new-doc mode, show the full
draft and ask what to add or change.

## R4, save
On confirmation, write the doc, then offer to generate test skeletons from the inferred
endpoints and rules (the build Phase 4 logic). Always disclose the limitations before
treating it as source of truth: the Purpose is inferred, implicit constraints (SLAs,
compliance, product decisions) are not captured, confirm accuracy. Regenerate
`.mdd/connections.md` if the doc graph changed.

## Messaging

Print one plain `[reverse-engineer] <what is happening>` line when starting (and at each later
stage of this flow), then work silently. Any question to the user is a
`WAITING ON YOU` block with numbered options, never an open-ended stop. End with a
short DONE line: what was produced, the key numbers, and the natural next action
(or `BLOCKED, <reason>` with numbered options).
Mirror the steps to the status bar: run `node .claude/hooks/lib/statusbar.cjs set reverse-engineer <step> <total> "<label>"` alongside each line and `node .claude/hooks/lib/statusbar.cjs done reverse-engineer` with the DONE line (pre-approved, best-effort, silent).
