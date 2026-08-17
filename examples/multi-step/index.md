# Multi-step Pipeline Example (F-PATTERN)

The LiveStage answer to multi-step agent work: files as steps, frontmatter
as state, assertions as gates. No workflow engine, no orchestrator process,
no daemon holding state between steps. Every step is just `livestage render`
against a plain `.stage` file; the only shared state is `state.stage`'s
frontmatter, read and written through the normal directive surface.


Current state: step 0, run none, updated
none.

## Running it

Pick a run id (any stable string for the duration of one run) and pass it
to every step with `--var run_id=<id>`:

```
livestage render 01-collect.stage --var run_id=demo-1
livestage render 02-analyze.stage --var run_id=demo-1
livestage render 03-report.stage --var run_id=demo-1
```

Run them out of order, or with a different `run_id` partway through, and
the next step blocks instead of silently trusting stale or missing state.
`livestage assert 02-analyze.stage --var run_id=demo-1` turns that same
check into a CI-style exit code.

See `README.md` in this directory for the full guide, including the
skipped-step, stale-state, and degraded-render failure modes this example
is built to demonstrate.
