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
 examples/agent-briefs/codebase-health.md | 13 +++----------
 scripts/example-render-targets.mjs       |  6 ++++++
 3 files changed, 10 insertions(+), 10 deletions(-)

### Recent commits
89f6723 Merge branch 'bug/strict-profile-comment-clarity'
224aa0d docs: clarify what the shipped 'strict' security profile means
b149d96 Merge branch 'chore/version-1.0.1'
05743da chore: bump version to 1.0.1
ca18fc9 Merge branch 'chore/gitignore-improvements-doc'

### Working tree status
M ../../.mdd/.drift
 M codebase-health.md
 M ../../scripts/example-render-targets.mjs
?? ../import-graph/
