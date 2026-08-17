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


- Branch: feat/drift-gates
- Last commit: 66208de docs: regenerate README.md (no other changes)
- Uncommitted files:
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
