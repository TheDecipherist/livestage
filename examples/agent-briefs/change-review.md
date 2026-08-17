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
.mdd/.drift                         |  3 ++
 .mdd/.statusbar.json                |  2 +-
 .mdd/docs/40-pattern-example.md     | 21 +++++++++++++
 .mdd/docs/44-examples-showcase.md   |  8 +++++
 .mdd/docs/46-connections-example.md |  6 ++++
 .mdd/docs/47-reach-via-code.md      |  6 ++++
 examples/multi-step/index.stage     |  2 +-
 scripts/check-example-renders.mjs   | 38 ++++++++++++++++++++----
 scripts/example-render-targets.mjs  | 59 ++++++++++++++++++++++++++++++++++++-
 9 files changed, 137 insertions(+), 8 deletions(-)

### Recent commits
c6cc81b Merge branch 'bug/example-rendered-output'
4ee574e fix: B1 give every drift example a committed, CI-verified rendered .md
9e21371 Merge branch 'feat/drift-examples'
600ce05 feat: add examples/drift/, four worked drift-elimination examples
af6e768 Merge branch 'bug/shell-command-chaining'

### Working tree status
M ../../.mdd/.drift
 M ../../.mdd/.statusbar.json
 M ../../.mdd/docs/40-pattern-example.md
 M ../../.mdd/docs/44-examples-showcase.md
 M ../../.mdd/docs/46-connections-example.md
 M ../../.mdd/docs/47-reach-via-code.md
 M ../multi-step/index.stage
 M ../../scripts/check-example-renders.mjs
 M ../../scripts/example-render-targets.mjs
?? codebase-health.md
?? onboarding-brief.md
