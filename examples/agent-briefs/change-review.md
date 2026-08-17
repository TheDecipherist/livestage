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
.gitignore                               |   6 ++
 .mdd/.drift                              |  19 ++++
 CLAUDE.md                                |  25 +++++-
 CLAUDE.stage                             |  12 +++
 README.md                                |   9 ++
 eslint.config.js                         |  10 ++-
 examples/agent-briefs/change-review.md   |  99 ++++++++-------------
 examples/agent-briefs/codebase-health.md |  69 +++++++-------
 examples/connections/connections.md      |   2 +-
 examples/http-health/check.md            |   2 +-
 examples/import-graph/import-graph.md    |   7 ++
 examples/showcase/report.md              |   2 +-
 package.json                             |   4 +-
 scripts/check-claude-md.mjs              |   5 +-
 scripts/check-readme.mjs                 |  10 ++-
 src/cli/cli.ts                           |   9 +-
 src/cli/commands/build.ts                |  72 +++++++++++++--
 src/engine/code-runners.ts               |  14 +--
 src/engine/index.ts                      |   5 ++
 src/hook/pretooluse.ts                   | 148 +++++++++++++++++++++++++++----
 tests/e2e/readme-generation.test.ts      |  64 +++++++++++++
 tests/unit/hook/pretooluse.test.ts       |   8 +-
 22 files changed, 452 insertions(+), 149 deletions(-)

### Recent commits
66208de docs: regenerate README.md (no other changes)
f1fe746 Merge branch 'feat/structured-output-composition'
083146f feat: make @code compose, structured output through @render/@foreach
1f9b727 Merge branch 'docs/scratch-file-policy'
cdcb3dd docs: session writeups always go to .ai_temp, never a claude.ai artifact

### Working tree status
M ../../.gitignore
 M ../../.mdd/.drift
 M ../../CLAUDE.md
 M ../../CLAUDE.stage
 M ../../README.md
 M ../../eslint.config.js
 M change-review.md
 M codebase-health.md
 M ../connections/connections.md
 M ../http-health/check.md
 M ../import-graph/import-graph.md
 M ../showcase/report.md
 M ../../package.json
 M ../../scripts/check-claude-md.mjs
 M ../../scripts/check-readme.mjs
 M ../../src/cli/cli.ts
 M ../../src/cli/commands/build.ts
 M ../../src/engine/code-runners.ts
 M ../../src/engine/index.ts
 M ../../src/hook/pretooluse.ts
 M ../../tests/e2e/readme-generation.test.ts
 M ../../tests/unit/hook/pretooluse.test.ts
?? ../../.githooks/
?? ../../gates/
?? ../../scripts/verify-generated.mjs
?? ../../src/engine/content-hash.ts
?? ../../src/engine/generated-metadata.ts
?? ../../tests/e2e/gates.test.ts
?? ../../tests/e2e/githooks-wiring.test.ts
?? ../../tests/unit/engine/generated-metadata.test.ts
?? ../../tests/unit/hook/generated-markdown-read.test.ts
