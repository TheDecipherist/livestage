# Codebase Health Brief

The old way: `git rev-parse --abbrev-ref HEAD`, `git log -1`, `git status
--short`, three separate commands run and mentally merged into one picture
of "is this repo in good shape right now."

The new way: one render.

## Policy grant this example needs

`examples/agent-briefs/.livestage/policy.json` in this directory (shared
with `change-review.stage`): `shell.enabled` plus the exact `git ...`
command strings below in `allow_patterns`, nothing else, and no wildcard
(a prefix pattern like `"git *"` allows anything after that prefix,
including `;`/`&&`/pipe chaining; only safe with commands that never
interpolate `{{ }}`/`${}` values, exact strings are the honest default).
See that file directly for the exact JSON.

## Result


- Branch: feat/import-graph-example
- Last commit: 89f6723 Merge branch 'bug/strict-profile-comment-clarity'
- Uncommitted files:
M ../../.mdd/.drift
 M ../../scripts/example-render-targets.mjs
?? ../import-graph/
