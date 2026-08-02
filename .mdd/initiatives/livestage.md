---
id: livestage
title: LiveStage
status: complete
version: 1
content_hash: 37f4ffe30a22
last_synced: 2026-08-02
---

# LiveStage

## Overview

LiveStage is a live-document renderer and verifier for AI agents: a `.stage`
file mixes prose with executable directives that declare their data instead of
storing it, and the engine resolves every directive at read time into pure
markdown with zero directive syntax remaining. It exists to kill the class of
document that goes stale the moment it is written, a project status page, a
dependency graph, a "what changed" log, and replace it with one that computes
its own answer on every read. The agent that consumes a render never needs to
know LiveStage exists; it just gets a document, and the document happens to be
correct.

The build is a near-total reuse of a donor codebase (`~/projects/markdownai`,
outside this repo, never shipped), copied and renamed rather than
reimplemented. Roughly 60 percent of the feature inventory arrives working from
the seed; the new code concentrates in `@assert`, `@code`, the schema engine,
args, and glue. This is a deliberate constraint, not a shortcut: every wave
task's first move is to open the donor copy-map row before writing anything,
and writing code or a feature doc the donor already has is a wave failure
(CR-D7). The donor's own feature-doc corpus is migrated the same way, mechanical
pass first, then a verification wave per doc.

The architecture follows from what the tool refuses to be. Not a server: no
daemon, no socket, no session, no cross-invocation memory beyond an append-only
trace the engine never reads back. Not a workflow engine: multi-step work is a
shipped pattern (files as steps, frontmatter as state, assertions as gates), not
machinery. Not a scaffolder: rendering is pure, the one sanctioned write is
`@update-frontmatter`, and any other write goes through policy-granted `@code`
where it is visible and traced. Not permissive: every execution surface
resolves through one deny-by-default allowlist, enforced after interpolation, so
untrusted arguments can never escalate.

The components fall into five internal modules. `parser` turns `.stage` text
into an AST against a fixed directive registry (nothing outside the registry
ever parses). `engine` executes it: sources, compute, composition, security,
cache, code runners, the assert operators, the schema engine, and the render
trace. `renderer` turns resolved data into the nine markdown shapes a pipeline
can end in. `cli` is the verb router that both the terminal and the hook call
through the same code path. `hook` is the thin PreToolUse/SessionStart
integration that makes a `.stage` read in an agent session identical to
`cli render`.

Done means: the seven waves below all reach their demo-state, all twelve
cross-cutting contracts (CR-1 through CR-11, CR-D7) pass as scans, registry
tests, or harnesses on every `npm test`, the bare-checkout e2e passes with only
`dist/livestage.js` present, and every migrated donor doc has been verified
against the seeded code, not merely copied.

## Waves

| Wave | Title | Demo-state |
|---|---|---|
| livestage-wave-0 | Seed | Repo compiles; merged suite runs; CR-1 grep clean or hits enumerated as Wave 1 tasks |
| livestage-wave-1 | Foundation | `render examples/hello.stage` returns pure markdown via CLI and hook identically; hook never fires on `.md`; `security show` prints strict policy; unallowlisted `@query` fails |
| livestage-wave-2 | Data plane | A live-brief doc renders current project state via CLI and hook identically; `strip` emits the degraded twin; `--args` flips a branch; goldens green |
| livestage-wave-3 | Verification | An assertion doc goes green then flips to FAIL on deleted targets (never vacuous); `validate` refuses inert docs; `assert` exits 1 on a bare-bundle CI checkout |
| livestage-wave-4 | Code + Doctor | A granted `@code` block emits JSON that renders as a table; an ungranted language fails at validate and runtime; `doctor` is one healthy line |
| livestage-wave-5 | Frontmatter engine + determinism | Schema blocks a violating write pre-write; `@graph` finds a planted cycle; a one-line `where=`/`fields=` query renders a 25-doc status table; two deterministic runs are byte-identical |
| livestage-wave-6 | Pattern, bundle, enforcement floor | The multi-step example renders green in sequence and red out of sequence; the bundle alone passes the bare-checkout e2e; every CR scan and the full suite are green |
