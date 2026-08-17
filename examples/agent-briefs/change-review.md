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
.mdd/.drift                              |  1 +
 examples/agent-briefs/codebase-health.md |  8 ++++----
 examples/import-graph/import-graph.js    |  7 +++++++
 tests/e2e/import-graph-example.test.ts   | 12 ++++++++++++
 4 files changed, 24 insertions(+), 4 deletions(-)

### Recent commits
076f098 Merge branch 'feat/import-graph-example'
4c4dfe4 feat: add examples/import-graph/, a real src/ Mermaid dependency graph
89f6723 Merge branch 'bug/strict-profile-comment-clarity'
224aa0d docs: clarify what the shipped 'strict' security profile means
b149d96 Merge branch 'chore/version-1.0.1'

### Working tree status
M ../../.mdd/.drift
 M codebase-health.md
 M ../import-graph/import-graph.js
 M ../../tests/e2e/import-graph-example.test.ts
