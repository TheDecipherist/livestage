# Change Review Brief

The old way: `git diff --stat`, `git log -5 --oneline`, `git status
--short`, three commands and three separate scrollbacks to reconstruct
"what changed here, and what's still uncommitted."

The new way: one render.

## Policy grant this example needs

Shares `examples/agent-briefs/.livestage/policy.json` with
`codebase-health.stage`: `shell.enabled` plus the exact `git ...` command
strings this file uses below in `allow_patterns`, no wildcard.

## Result


### Diff stat
.mdd/.drift                                      |  34 ++++
 benchmarks/unused-exports/.livestage/policy.json |   2 +-
 benchmarks/unused-exports/unused-exports.js      |  23 ++-
 benchmarks/unused-exports/unused-exports.stage   |  16 +-
 examples/agent-briefs/codebase-health.md         |  47 ++++--
 src/engine/code-runners.ts                       | 189 +++++++++++++++++++----
 src/engine/conditions.ts                         |   6 +
 src/engine/engine-interpolate.ts                 |  10 ++
 src/engine/engine.ts                             |  72 ++++++++-
 src/engine/frontmatter-utils.ts                  |  18 ++-
 src/engine/iter-ops.ts                           | 118 +++++++++++++-
 src/renderer/formats/bar.ts                      |  23 ++-
 src/renderer/formats/code.ts                     |   9 +-
 src/renderer/formats/inline.ts                   |   6 +-
 src/renderer/formats/json.ts                     |   9 +-
 src/renderer/formats/links.ts                    |   3 +-
 src/renderer/formats/list.ts                     |   3 +-
 src/renderer/formats/numbered.ts                 |   3 +-
 src/renderer/formats/table.ts                    |  18 ++-
 src/renderer/formats/tree.ts                     |  17 +-
 src/renderer/types.ts                            |  11 +-
 tests/unit/engine/directive-cache.test.ts        |  73 +++++++++
 tests/unit/renderer/renderer.test.ts             |  86 +++++++++++
 23 files changed, 706 insertions(+), 90 deletions(-)

### Recent commits
1f9b727 Merge branch 'docs/scratch-file-policy'
cdcb3dd docs: session writeups always go to .ai_temp, never a claude.ai artifact
407add6 Merge branch 'bench/class3-construction-tests'
3416b91 docs: add class-3-construction-tests.md report
0e02e30 bench: class 3 construction tests, dead-code detection and import-graph re-verification

### Working tree status
M ../../.mdd/.drift
 M ../../benchmarks/unused-exports/.livestage/policy.json
 M ../../benchmarks/unused-exports/unused-exports.js
 M ../../benchmarks/unused-exports/unused-exports.stage
 M codebase-health.md
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
