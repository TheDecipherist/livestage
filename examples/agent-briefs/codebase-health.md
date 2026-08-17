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


- Branch: bug/all-examples-rendered-output
- Last commit: c6cc81b Merge branch 'bug/example-rendered-output'
- Uncommitted files:
M ../../.mdd/.drift
 M ../../.mdd/.statusbar.json
 M ../../.mdd/docs/40-pattern-example.md
 M ../../.mdd/docs/44-examples-showcase.md
 M ../../.mdd/docs/46-connections-example.md
 M ../../.mdd/docs/47-reach-via-code.md
 M ../multi-step/index.stage
 M ../../scripts/check-example-renders.mjs
 M ../../scripts/example-render-targets.mjs
?? onboarding-brief.md
