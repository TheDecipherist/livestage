# TODO Debt

The old way: a "known issues" doc somebody wrote once, or nobody
maintains a list at all and debt just accumulates in comments nobody
revisits.

The new way: a live file:line inventory, straight from the source.

## Policy grant this example needs

`.livestage/policy.json` in this directory: `shell.enabled` plus the
exact `grep -rnE 'TODO|FIXME|HACK' sample-project/src` command string,
nothing else, an exact string since it never interpolates `{{ }}`/`${}`
values.

## Result

sample-project/src/payments.ts:2:  // TODO: handle currency conversion, this assumes USD everywhere
sample-project/src/payments.ts:3:  // FIXME: retry logic is broken under load, see incident 2026-07-19
sample-project/src/payments.ts:9:  // HACK: refunds are processed manually until the provider API ships one

---

Three markers, one file, three pieces of real work somebody left a note
about, all surfaced with zero maintenance. Fix one and re-render; it
drops off the list on its own, no doc to remember to update.
