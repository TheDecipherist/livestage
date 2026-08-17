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
 eslint.config.js                         |  8 +++-
 examples/agent-briefs/codebase-health.md | 14 ++++--
 package-lock.json                        | 77 ++++++++++++++++++++++++++++++++
 package.json                             |  1 +
 src/engine/import-graph.ts               | 14 +++++-
 6 files changed, 108 insertions(+), 7 deletions(-)

### Recent commits
43778be Merge branch 'bug/measurement-harness-and-trust-hardening'
880031c feat(import-graph): resolve tsconfig.json path aliases generically
a640eff chore: bump version to 1.0.2, add CHANGELOG.md for the shell-chaining fix
ec1008c security: wire workspace trust into loadSecurityConfig's default path
f32ccf3 feat: measurement harness recovered into benchmarks/; coverage-map now reduces

### Working tree status
M ../../.mdd/.drift
 M ../../eslint.config.js
 M codebase-health.md
 M ../../package-lock.json
 M ../../package.json
 M ../../src/engine/import-graph.ts
?? ../../artifacts.md
?? ../../benchmarks/import-graph-ground-truth.cjs
?? ../../benchmarks/unused-exports/
?? ../../results-check.md
