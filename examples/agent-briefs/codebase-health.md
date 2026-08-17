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


- Branch: feat/structured-output-composition
- Last commit: 1f9b727 Merge branch 'docs/scratch-file-policy'
- Uncommitted files:
M ../../.mdd/.drift
 M ../../benchmarks/unused-exports/.livestage/policy.json
 M ../../benchmarks/unused-exports/unused-exports.js
 M ../../benchmarks/unused-exports/unused-exports.stage
 M ../../src/engine/code-runners.ts
 M ../../src/engine/conditions.ts
 M ../../src/engine/engine-interpolate.ts
 M ../../src/engine/engine.ts
 M ../../src/engine/frontmatter-utils.ts
 M ../../src/engine/iter-ops.ts
 M ../../src/renderer/formats/bar.ts
 M ../../src/renderer/formats/code.ts
 M ../../src/renderer/formats/inline.ts
 M ../../src/renderer/formats/json.ts
 M ../../src/renderer/formats/links.ts
 M ../../src/renderer/formats/list.ts
 M ../../src/renderer/formats/numbered.ts
 M ../../src/renderer/formats/table.ts
 M ../../src/renderer/formats/tree.ts
 M ../../src/renderer/types.ts
 M ../../tests/unit/engine/directive-cache.test.ts
 M ../../tests/unit/renderer/renderer.test.ts
?? ../../benchmarks/unused-exports/coverage.sh
?? ../../benchmarks/unused-exports/greeting.sh
?? ../../benchmarks/unused-exports/parse-formats-demo.stage
?? ../../benchmarks/unused-exports/unused-exports-by-kind.stage
?? ../../src/engine/dotted-access-check.ts
?? ../../src/engine/parse-formats.ts
?? ../../src/engine/render-data.ts
?? ../../src/renderer/object-rows.ts
?? ../../tests/fixtures/
?? ../../tests/unit/engine/code-parse-formats.test.ts
?? ../../tests/unit/engine/foreach-structured.test.ts
?? ../../tests/unit/engine/parse-formats.test.ts
?? ../../tests/unit/engine/render-data.test.ts
?? ../../tests/unit/engine/render-standalone.test.ts
