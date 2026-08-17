// Shared list of example render targets, consumed by both
// render-examples.mjs (writes) and check-example-renders.mjs (verifies,
// never writes). One source of truth so the two scripts can't drift
// against each other about which examples are covered.
//
// cwd is relative to the repo root (examples render from their own
// directory, same as a reader following each README's instructions).
// stage/md are relative to cwd.
//
// checked (default true): whether check-example-renders.mjs enforces an
// exact match. Some examples are deliberately, honestly non-deterministic
// (live git state, wall-clock timing, the real filesystem tree of a
// directory that gains untracked trace files over time) -- their whole
// point is "this is different every time you run it," so a strict
// byte-diff CI gate on them would either flake constantly or lie about
// what the example demonstrates. Those get checked: false: still
// rendered and committed so a reader has something to look at, but only
// existence/non-emptiness is verified, not exact content.
//
// normalize (optional): an array of {pattern, replacement} applied to
// BOTH the committed .md and the fresh render before comparing, for
// examples that are deterministic in substance but carry one genuinely
// volatile detail (a render timestamp, a millisecond latency reading).
// The committed .md still shows the REAL value from whenever it was
// generated; only the comparison ignores it.
const ISO_TIMESTAMP = { pattern: /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z/g, replacement: '<TIMESTAMP>' }
const LATENCY_MS = { pattern: /Latency: \d+ms/g, replacement: 'Latency: <MS>ms' }

export const EXAMPLE_RENDER_TARGETS = [
  // feature 51, drift examples: fully deterministic, static fixtures only.
  { cwd: 'examples/drift/env-drift', stage: 'env-drift.stage', md: 'env-drift.md' },
  { cwd: 'examples/drift/scripts-reference', stage: 'scripts-reference.stage', md: 'scripts-reference.md' },
  { cwd: 'examples/drift/test-coverage-map', stage: 'test-coverage-map.stage', md: 'test-coverage-map.md' },
  { cwd: 'examples/drift/todo-debt', stage: 'todo-debt.stage', md: 'todo-debt.md' },

  // feature 48, agent-briefs: onboarding-brief reads only static fixtures
  // (checked); codebase-health/change-review read the LIVE repo's git
  // state (branch, log, diff, status), genuinely different on every
  // checkout and every commit, unchecked by design.
  { cwd: 'examples/agent-briefs', stage: 'onboarding-brief.stage', md: 'onboarding-brief.md' },
  { cwd: 'examples/agent-briefs', stage: 'codebase-health.stage', md: 'codebase-health.md', checked: false },
  { cwd: 'examples/agent-briefs', stage: 'change-review.stage', md: 'change-review.md', checked: false },

  // feature 47, reach via code: database is a pure fixture read (checked);
  // http-health's latency_ms is real wall-clock timing, normalized.
  { cwd: 'examples/database', stage: 'customers.stage', md: 'customers.md' },
  { cwd: 'examples/http-health', stage: 'check.stage', md: 'check.md', normalize: [LATENCY_MS] },

  // feature 46, connections: static corpus fixture, one now_iso() line
  // normalized out.
  { cwd: 'examples/connections', stage: 'connections.stage', md: 'connections.md', normalize: [ISO_TIMESTAMP] },

  // feature 40, pattern example: index.stage only (pure @read-frontmatter,
  // no writes). The three pipeline steps + state.stage are deliberately
  // EXCLUDED here, not just unchecked: rendering them runs
  // @update-frontmatter against the checked-in state.stage, which would
  // mutate a git-tracked fixture as a side effect of running this script.
  { cwd: 'examples/multi-step', stage: 'index.stage', md: 'index.md' },

  // feature 44, showcase: api-reference is a pure fixture read (checked);
  // report.stage's @tree ./ includes untracked, environment-dependent
  // .livestage/trace/ entries plus its own now_iso() line, unchecked.
  { cwd: 'examples/showcase', stage: 'index.stage', md: 'index.md' },
  { cwd: 'examples/showcase', stage: 'api-reference.stage', md: 'api-reference.md' },
  { cwd: 'examples/showcase', stage: 'report.stage', md: 'report.md', checked: false },

  // Top-level hello world: @date plus @tree of the live, growing examples/
  // directory, genuinely different by design. No owning doc claims this
  // file; recorded here anyway so a reader still sees something.
  { cwd: 'examples', stage: 'hello.stage', md: 'hello.md', checked: false },
]
