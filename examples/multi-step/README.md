# Multi-step Pipeline Example

Proves multi-step agent work is a shipped *pattern*, not workflow-engine
machinery: files as steps, frontmatter as state, assertions as gates.

## Files

- `index.stage` - overview, current state, how to run it.
- `state.stage` - the only state store. Its frontmatter (`run_id`, `step`,
  `updated_at`) is schema-validated (`.livestage/schemas/pipeline-state.json`)
  and updated only by `@update-frontmatter`, never by hand.
- `01-collect.stage`, `02-analyze.stage`, `03-report.stage` - the three
  steps. Each later step opens with an `@assert` gate plus an `@if` check
  against `state.stage` before doing any work, so a step that shouldn't run
  yet blocks instead of corrupting state.

`.livestage/policy.json` in this directory grants `filesystem.write_enabled`
scoped to this directory (`cwd`), so `@update-frontmatter` works when you
run these commands from inside `examples/multi-step/`. The main project
policy is unaffected.

## Running the happy path

```sh
cd examples/multi-step
livestage render 01-collect.stage --var run_id=demo-1
livestage render 02-analyze.stage --var run_id=demo-1
livestage render 03-report.stage --var run_id=demo-1
```

Each step reports "complete" and `state.stage` ends at `step: "3"`.

## The three failure modes this example demonstrates

**Skipped-step.** Run `02-analyze.stage` before `01-collect.stage` (or
reset `state.stage` to `step: "0"` first). The step renders a
`**BLOCKED (skipped-step)**` message instead of analyzing nothing, and
`livestage assert 02-analyze.stage --var run_id=demo-1` exits 1.

**Stale-state.** Run `01-collect.stage --var run_id=demo-1`, then run
`02-analyze.stage --var run_id=demo-2` (a different run id). `state.stage`
shows step 1 complete, but for a run this invocation doesn't recognize; the
step renders `**BLOCKED (stale-state)**` rather than silently analyzing
data collected for a different run.

**Degraded-render recovery.** Each step's `@update-frontmatter` calls come
last, after the step's own work. If a render is killed mid-way (a hook
timeout, feature 24's degraded-render path), `state.stage` was never
reached, so it still reflects the last step that actually finished. Re-run
the same step; nothing needs to be undone or repaired by hand.

## Why not a workflow engine

There is no process holding state between these three commands, no
scheduler, nothing to restart. Each step is a stateless `livestage render`
call that reads and writes one plain file. That is the whole mechanism.
