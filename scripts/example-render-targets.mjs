// Shared list of {cwd, stage, md} triples consumed by both
// render-examples.mjs (writes) and check-example-renders.mjs (verifies,
// never writes). One source of truth so the two scripts can't drift
// against each other about which examples are covered.
//
// cwd is relative to the repo root (examples render from their own
// directory, same as a reader following each README's instructions).
// stage/md are relative to cwd.
export const EXAMPLE_RENDER_TARGETS = [
  { cwd: 'examples/drift/env-drift', stage: 'env-drift.stage', md: 'env-drift.md' },
  { cwd: 'examples/drift/scripts-reference', stage: 'scripts-reference.stage', md: 'scripts-reference.md' },
  { cwd: 'examples/drift/test-coverage-map', stage: 'test-coverage-map.stage', md: 'test-coverage-map.md' },
  { cwd: 'examples/drift/todo-debt', stage: 'todo-debt.stage', md: 'todo-debt.md' },
]
