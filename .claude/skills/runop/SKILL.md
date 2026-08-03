---
name: runop
description: Execute a deployment runbook with pre-flight health checks, canary-gated region-by-region deployment, and post-flight verification, writing live service health back into the runbook. Invoke with /runop followed by the slug.
disable-model-invocation: true
user-invocable: true
argument-hint: "[runbook slug]"
arguments: [slug]
---

Run `node .claude/hooks/lib/mdd-ensure.cjs` first, before anything else. It creates `.mdd` and its essential files if missing, and is a silent no-op otherwise.

Execute runbook: $slug

## RO1, load
Require the slug. Find the runbook project-first (`.mdd/ops/$slug.md`) then global
(`~/.claude/ops/$slug.md`), announcing which; hard stop if neither exists. Parse regions
(sorted by deploy_order), services, and deployment_strategy.

## RO2, pre-flight
Run each service's health_check in each of its regions, show a cross-region status table,
and write the fresh `status` and `last_checked` back into each service's per-region block
immediately. For any service not healthy, ask per region: redeploy, skip, or abort.

## RO3, deploy region by region (in deploy_order)
For each region in order:
- Deploy each service marked for redeploy: use the region's image (falling back to the service image), walk its Deployment Procedure steps, announcing each, running the action, then the verify. A failed verify stops the deploy, shows the exact output, and surfaces the Rollback Plan; if `rollback_on_failure` is true, run the rollback steps automatically then stop.
- Region gate: re-run health checks for the region. If the gate is `health_check` and anything is unhealthy, apply `on_gate_failure`: stop (halt and report that the next region was NOT deployed), skip_region (log and advance), or rollback (run the rollback then stop). A `manual` gate always pauses for confirmation. A `none` gate advances immediately. Write status back before stopping or advancing.

## RO4, post-flight
Re-run all health checks across all regions, show a before/after table, write final
`status` and `last_checked`, and append any still-failing service to the runbook's
`known_issues`.

## RO5, summary
Write `last_synced: today` to the runbook, then report the final cross-region health, the
canary gate result, regions deployed, and steps executed. If the canary gate failed and
the primary was skipped, say so plainly with the fix (resolve the canary service, re-run).

## Messaging

Print one plain `[runop] <what is happening>` line when starting (and at each later
stage of this flow), then work silently. Any question to the user is a
`WAITING ON YOU` line, with the choices presented through the AskUserQuestion tool so the user picks with the arrow keys and enter, NEVER a typed-answer prose prompt. The recommended option is always FIRST and labeled "(Recommended)". Numbered text options are the fallback only when the tool is unavailable (headless or unattended runs). Never an open-ended stop. End with a
short DONE line: what was produced, the key numbers, and the natural next action
(or `BLOCKED, <reason>` with the ways forward offered via AskUserQuestion, recommended first).
Mirror the steps to the status bar: run `node .claude/hooks/lib/statusbar.cjs set runop <step> <total> "<label>"` alongside each line and `node .claude/hooks/lib/statusbar.cjs done runop` with the DONE line (pre-approved, best-effort, silent). At the very FIRST Say line also run `node .claude/hooks/lib/statusbar.cjs run-start <flow>`, ONLY when the user invoked this skill (directly or via plain-language routing); NEVER when executing inside another MDD flow, the outermost user-invoked run owns the elapsed timer and sub-runs must not touch it. Whenever stopping for user input (any WAITING ON YOU), first run `node .claude/hooks/lib/statusbar.cjs pause` so waiting time never counts as run time; the timer resumes automatically on the next `set` after the answer. When the run completes, the freezing `done <flow>`/`run-done` call PRINTS `MDD <run> completed in <elapsed>`: repeat that line VERBATIM as the very LAST user-visible line of the run, after everything else in the DONE block, always. Task checklist, always: at run start create the session task list (TodoWrite / the native task tool) with one entry per step of this skill, named exactly like the Say lines; mark the current entry in_progress and check each one off AT the moment its step completes, so the full plan, what is done, and what is running are visible the whole run. Same ownership rule as the timer: the user-invoked wrapper creates the list; a skill executing inside another MDD flow NEVER creates or replaces it, the wrapper's list already carries that work as an entry. Micro-status: the checklist is the broad strokes; the status bar label is the LIVE one. Between Say lines, refresh it (`set <flow> <N> <T> "<msg>"`, same phase numbers) every time the concrete action changes: dispatching agents, reading a file, writing a specific file, running the suite, gate iteration K, waiting on a command. Present tense, specific, short (under ~48 chars), e.g. "writing tests/auth.test.ts", "suite run 2, 3 red", "wiring routes/session.ts". A label that sits unchanged through many actions reads as hung; the set call is near-free, refresh it liberally.
