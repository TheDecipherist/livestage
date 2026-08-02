---
name: status
description: Full overview of MDD state, then rebuild the session brief. Counts docs, tests, known issues, and quality-gate violations, reports audits, initiatives, waves, mdd_version spread, and a lightweight drift check, then rewrites .mdd/.startup.md (preserving the Notes zone) and checks connections freshness. Invoke with /status.
disable-model-invocation: true
user-invocable: true
allowed-tools: "Read, Grep, Glob, Bash, Write"
---

Run `node .claude/hooks/lib/mdd-ensure.cjs` first, before anything else. It creates `.mdd` and its essential files if missing, and is a silent no-op otherwise.

Report MDD state, then rebuild the brief.

## Collect
- `.mdd/docs/` feature-doc count, `.mdd/ops/` runbook count. A count of ZERO
  feature docs is the headline, not a table cell: open the status block with
  "MDD is installed but has no feature docs yet, nothing is being tracked" and
  point to /import-spec, /build, or /update as the ways in (mdd-notes3 2.2).
- Latest `.mdd/audits/report-*.md`: findings, fixed, open.
- Test counts (from the project's test runner in JSON mode if available).
- Known issues: grep `known_issues` across docs.
- Quality gates: files over 300 lines.
- `.mdd/initiatives/` count by status, `.mdd/waves/` by status, and per active wave the complete/total feature count.
- Version spread: read the current `mdd_version`, then grep `mdd_version` across all `.mdd/` files and group by version.
- Audit-in-progress: if any `.mdd/jobs/audit-*/` exists, count its manifest states and show a warning line to resume or discard.

## Drift check (lightweight, not a full scan)
For each doc: read `last_synced`. Missing means untracked. Present means run
`git log --oneline --after="<last_synced>" -- <first source_file>`, non-empty output
means possibly drifted. Count in-sync / possibly-drifted / untracked. Full detail is
`/scan`.

## Present
A compact status block: the audit-in-progress warning if any, doc and ops counts, last
audit line, test coverage, known issues, quality-gate count, initiatives and active
waves, the mdd_version breakdown (or "all up to date" if uniform), and the drift
counts. End with the natural next actions (audit, scan, plan-initiative, ops, or build), and a closing line that `/mdd` shows the full command catalog.

## Rebuild .mdd/.startup.md
Preserve the Notes zone exactly (everything below the `---` divider, the user's
append-only space). Rebuild the auto-generated zone above it: `Generated: <today>`,
`Branch:` from git, `Stack:` if detectable, `Features Documented:` as a sorted list of
`- <id> (<status>) [tags]` (omit the brackets if a doc has no tags), `Ops Runbooks:` as
`- <slug> [tags]` (omit the section if none), `Last Audit:` counts, and the static Rules
Summary. Bump the file's `mdd_version`. Create it fresh with an empty Notes zone if it
does not exist.

## Connections freshness
If `.mdd/connections.md` is missing, report "run /connect to generate". If its
`generated:` date is older than the newest doc `last_synced`, report it is stale. Else
report it is current with its doc and edge counts. Status only reports freshness, it
does not regenerate, that is `/connect`.

## Messaging

Print one plain `[status] <what is happening>` line when starting (and at each later
stage of this flow), then work silently. Any question to the user is a
`WAITING ON YOU` block with numbered options, never an open-ended stop. End with a
short DONE line: what was produced, the key numbers, and the natural next action
(or `BLOCKED, <reason>` with numbered options).
Mirror the steps to the status bar: run `node .claude/hooks/lib/statusbar.cjs set status <step> <total> "<label>"` alongside each line and `node .claude/hooks/lib/statusbar.cjs done status` with the DONE line (pre-approved, best-effort, silent).
