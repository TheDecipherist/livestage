---
id: 48-auto-readme-generation
title: Auto README Generation
type: COMPONENT
path: Docs / README Generation
source_files: [README.stage, README.md, examples/agent-briefs/codebase-health.stage,
  examples/agent-briefs/change-review.stage, examples/agent-briefs/onboarding-brief.stage,
  examples/agent-briefs/.livestage/policy.json, package.json, .github/workflows/ci.yml]
status: complete
phase: all
last_synced: 2026-08-02
initiative: livestage
depends_on: [09-grammar-parser, 13-cli-router, 17-source-directives, 20-render-formats, 36-frontmatter-query]
tags: [readme, self-documenting, frontmatter-query, read-section, dogfooding, ci-drift-check]
test_files: [tests/e2e/readme-generation.test.ts, tests/e2e/agent-briefs.test.ts]
data_flow: .mdd/audits/flow-auto-readme-generation-2026-08-02.md
known_issues:
  - "RESOLVED (2026-08-02, found by independent review before merge, not by the Red/Green gate): the original coverage-guard test only checked whether a directive's name appeared ANYWHERE in the rendered output, which proved vacuous, deliberately breaking 29-code-runners.md's path field (so the discovery query would exclude it) still left the test green, because OTHER docs' cross-referencing prose (e.g. 27-assert-liveness.md saying \"ungranted @code language\") still mentioned the name. Replaced with a test that extracts the real query line from README.stage, runs it standalone, and asserts the exact doc-id set it returns against a known-correct list. Re-verified: the same sabotage now correctly fails the test."
  - "RESOLVED (2026-08-02, found by independent review): tests/e2e/readme-generation.test.ts originally called `npm run readme` directly against the repo root as part of the test, which regenerates the REAL, git-tracked README.md as a side effect of running the test suite. Since `npm test` runs before `npm run readme:check` in CI, this silently \"fixed\" any drift in README.md before the drift-check step ever ran, making the whole CI gate this feature exists to add vacuous. Fixed: the test now writes to a scratch path under .ai_temp/ (gitignored) instead, and check-readme.mjs is invoked directly (not via the npm script) so it is never coupled to a step that mutates the file it's checking. Added a new negative test proving readme:check actually fails on a deliberately-staled README.md, restored via try/finally."
  - "RESOLVED (2026-08-02, found by independent review): examples/agent-briefs/.livestage/policy.json originally granted shell.allow_patterns: [\"git *\"], a prefix wildcard. checkShellCommand's pattern matching (src/engine/security/rules.ts) turns `*` into an unanchored `.*`, so `git *` matches ANY command starting with the literal text \"git \", including chained commands like `git status --short; id` (verified live: this exact PoC executed `id`). Not exploitable as shipped (none of the five @query calls in these examples interpolate `{{ }}`/`${}` values, they are fixed literal strings), but dangerous to document and hold up as a template to copy, which this feature's own README prominently does. Fixed: allow_patterns now lists the five exact command strings with no wildcard, closing the injection surface entirely for this policy file. The underlying `checkShellCommand`/`matchShellPattern` prefix-wildcard weakness is NOT fixed here (see below, out of scope)."
  - "RESOLVED (2026-08-02, found by independent review): .gitignore's `examples/*/.livestage/trace/`/`cache/` patterns matched only one directory level (gitignore `*` does not cross `/`), so a more deeply nested `.livestage/` (e.g. under examples/agent-briefs/sample-project/, or any future multi-level example) would not be covered, and trace records contain the developer's absolute local paths plus resolved directive args, a real local-info leak if ever committed. Widened to `**/.livestage/trace/` and `**/.livestage/cache/` (any depth); policy.json/schemas/ under the same directories remain untouched by this and stay tracked."
  - "RESOLVED (2026-08-02, found by independent review): two tests in tests/e2e/agent-briefs.test.ts (codebase-health.stage, change-review.stage) originally asserted only on static template text (\"Branch:\", \"Diff stat\", etc.), which would pass unchanged even if the underlying @query calls were broken and returned nothing (verified via a break-test). Strengthened to assert against real values computed independently in the test (the actual current branch via a direct `git rev-parse`, the actual current HEAD's short hash). A third assertion (onboarding-brief.stage) checked for the bare string \"sample-project\", which also appears in the file's own static prose regardless of whether the live @read actually ran; strengthened to check the interpolated heading and the fixture's distinctive description field instead."
  - "KNOWN LIMITATION, not fixed (an honest tradeoff, not an oversight): codebase-health.stage's \"Uncommitted files: none detected\" branch cannot distinguish a genuinely clean working tree from a query that silently returned nothing (blocked by policy, or run in a non-git directory both degrade to an empty string with no exception `{{ }}` expressions can observe; @query does not expose its exit code / ran-successfully state to the sandbox the way @code's structured `_exit` result does). Softened the wording from \"none (clean)\" to \"none detected\" to avoid overclaiming certainty; a fuller fix (surfacing @query's success/failure to `{{ }}` expressions) is a framework-level change to feature 18 (Compute Directives), out of scope here."
  - "RESOLVED (2026-08-17, bug/shell-command-chaining, see 10-security-policy-core B1): the prefix-wildcard weakness flagged below as out of scope is fixed. The fix does not touch matchShellPattern's matching logic (defaultSecurityConfig()'s git */cat */find */grep * patterns still match exactly what they always matched); instead it shell-quotes the VALUE at every {{ }}-interpolation and @foreach/@call-substitution site that reaches a command= field (interpolateShellSafe, subStrShellSafe), before the allowlist check ever runs. A project relying on the framework's own default allowlist is protected the same as one with a custom policy, since the fix is at the splice point, not the pattern. Original note, for the record: `checkShellCommand`'s prefix-wildcard pattern matching (src/engine/security/rules.ts's `matchShellPattern`, turning a trailing `*` into an unanchored `.*`) was a genuine, PRE-EXISTING command-injection-capable weakness affecting more than this feature: `defaultSecurityConfig()` (src/engine/security/config.ts, used whenever no project `.livestage/policy.json` exists at all) itself ships `git *`, `cat *`, `find *`, `grep *`, and several other prefix-wildcard patterns as its curated default allowlist, so any project relying on the framework's own default (not just this feature's example) was exposed to the same class of injection the moment a @query command in that project interpolated `{{ }}`/`${}` into a `git *`-shaped command."
  - "[gap] B1: none of the examples this feature covers (the three
    agent-briefs) ship a rendered .md output committed alongside their
    .stage source, unlike this feature's OWN top-level README.stage/
    README.md pair, which has npm run readme + npm run readme:check +
    scripts/check-readme.mjs enforcing the pair never drifts, wired into
    CI. A reader browsing an example on GitHub has no way to see what it
    actually produces without cloning, building, and running the CLI.
    Found 2026-08-17 while addressing the same gap in feature 51
    (Drift Examples)."
---

# Auto README Generation

## Purpose

`README.md` has always been a chore: every directive added, every example
written, every project stat that changes makes the README stale the moment
nobody remembers to touch it by hand. This feature replaces the hand-written
`README.md` with `README.stage`, a live document that renders itself into
`README.md` by reading the project's own state at render time, the directive
registry's documentation (via the `.mdd/docs/` corpus), `package.json`, and
the real, runnable example files under `examples/`. Regenerating it is one
command (`npm run readme`); `npm run readme:check` (wired into CI) fails the
build the moment `README.md` drifts from what `README.stage` would produce,
so staleness is caught, not just discouraged.

This is also the project's own answer to the question it poses to every
other codebase: replace N bash/grep/find calls (read the registry, read every
directive's docs, read package.json, hand-format a table) with one render
that returns a finished status result. `examples/agent-briefs/` demonstrates
the same pattern for everyday agent workflows (a codebase health check, a
change review, an onboarding brief), each contrasting the old multi-command
bash sequence with the one `.stage` render that replaces it.

## Architecture

`README.stage` never hand-copies content. Every section is a directive call
against a live source:

- **Directive reference**: `.mdd/docs/*.md` is queried live via the
  frontmatter-query engine (feature 36) for every doc that documents a
  directive (`path.startsWith('Directives')`, plus the two docs filed under a
  different path that also document one: `Renderer / Formats` for `@render`,
  `Engine / Code Runners` for `@code`). For each match, the `read_section()`
  sandbox builtin pulls that doc's real `## API/Interface` and
  `## Business Rules` sections verbatim. Adding a new directive to an
  existing doc's API/Interface section (the normal MDD Phase 3 doc-write,
  something every feature build already does) makes it appear in the README
  on the next render, no README-specific work required. Only a brand new
  directive-owning doc filed outside the `Directives /` path convention (like
  `20`/`29` were) needs a one-line addition to this filter, and a coverage
  test (see Data Model) fails CI loudly if that step is ever missed.
- **Project metadata**: `package.json`'s `name`/`version`/`description` are
  read live via `@read`, never retyped.
- **Real-world examples**: `examples/agent-briefs/*.stage` are embedded by
  reading their actual source text, so the shown code can never drift from
  what actually runs (each is also independently tested, see test_files).
- **Regeneration**: `npm run readme` calls the existing `livestage build`
  verb (feature 13), already-implemented CLI functionality, not new code.

## Data Model

N/A (no persisted data model; every value is read fresh from the filesystem
at render time). The one enforced invariant: `getAvailableDirectives()`
(feature 09's registry) and the directive-doc query above must agree.
`tests/e2e/readme-generation.test.ts` renders `README.stage` and asserts
every name the registry returns appears in the output, a coverage/drift
guard that fails CI if a directive is ever added without a corresponding
doc entry the query can find.

## API Endpoints

N/A. No new CLI verb; this feature is entirely `.stage` content plus two npm
scripts (`readme`, `readme:check`) that shell out to the CLI's existing
`build` verb (feature 13).

## Business Rules

1. Directive documentation in the generated README is pulled live from
   `.mdd/docs/*.md`, never hand-copied or hardcoded.
2. The directive-doc discovery query must cover every directive the registry
   returns; a coverage test blocks CI when it does not.
3. `package.json` fields shown in the README are read live, never retyped.
4. Real-world example snippets shown in the README are the actual source of
   a real, independently-tested `examples/agent-briefs/*.stage` file, never a
   hand-typed illustration that can drift from what actually runs.
5. `npm run readme` regenerates `README.md` from `README.stage` via the
   existing `build` verb.
6. `npm run readme:check` renders `README.stage` fresh (in memory, no temp
   file) and fails (non-zero exit) if the result differs from the committed
   `README.md`; this step runs in CI, after `npm test` (which no longer
   mutates `README.md` as a side effect, see known_issues).

## Data Flow

See `.mdd/audits/flow-auto-readme-generation-2026-08-02.md` for the full
trace, including the exact live-verified `.stage` syntax (frontmatter-query
+ `@foreach` + `read_section()`) and two parser/CLI gotchas discovered and
worked around while proving the design (a pipe stage cannot sit directly
inside a `@foreach ... in` source expression; the CLI's default data jail is
the entry file's own directory, not `--cwd`, so `README.stage` must live at
the actual repo root for its own `.mdd/docs` reads to resolve, which is
exactly where it belongs).

## Dependencies

09-grammar-parser (the directive registry the coverage test verifies
against), 13-cli-router (the `build` verb both npm scripts shell out to),
17-source-directives (this feature's implementation adds `visible=`/`silent=`
support to `@read-frontmatter`, which `README.stage` needs to invisibly
capture a doc's title; the fix itself is attributed to feature 17's own
`source_files`/`known_issues`, not this feature's, since it is a general
directive-contract fix, not something specific to README generation),
20-render-formats (the generated tables/sections route through `@render`),
36-frontmatter-query (the `where=`/`fields=` mechanism the directive-doc
discovery query is built on).

## Security

No new untrusted-input surface. `README.stage` reads only project-internal,
already-trusted files (`.mdd/docs/`, `package.json`, `examples/`), the same
trust boundary every other `.stage` file in this repo operates under. It
exposes no new CLI verb, MCP tool, or externally-callable function.

`examples/agent-briefs/`'s three files are the only new files in this
feature that request a policy grant: `shell.enabled` for `git` introspection
commands, scoped to `examples/agent-briefs/.livestage/policy.json` (loaded
by `cwd`, so it only actually applies when rendered from inside that
directory, as documented; rendering from elsewhere falls back to whatever
security config applies at the actual render `cwd`, most commonly the
framework's own built-in default profile, not a broader grant this feature
introduces). `allow_patterns` lists the five exact command strings the
examples use, no wildcard, after an independent security review found the
originally-shipped `git *` wildcard pattern was command-injection-capable
(see known_issues) even though none of the five actual `@query` calls have
an injection point themselves (all five are fixed literal strings, none
interpolate `{{ }}`/`${}`). The broader, framework-level version of that
same wildcard weakness (the built-in default security profile ships several
prefix-wildcard patterns of its own) is reported in known_issues as
explicitly out of scope for this feature.

## Known Issues

See the frontmatter `known_issues` above: five real issues were found by
independent review before merge (a vacuous coverage guard, a test that
mutated the tracked README.md and made the CI drift gate vacuous, a
command-injection-capable wildcard in the new example policy, a
single-depth `.gitignore` pattern, and two tautological test assertions),
all fixed and re-verified live (each fix was proven to actually change the
test's pass/fail outcome under the failure condition it addresses, not just
edited and trusted). One known limitation is left as an honest tradeoff
(codebase-health.stage's "clean" detection can't distinguish a real clean
tree from a silently-blocked query). One finding is explicitly out of scope
and reported, not fixed: a framework-level shell-pattern-matching weakness
predating this feature and affecting the built-in default security profile
too, not just this feature's own files.
