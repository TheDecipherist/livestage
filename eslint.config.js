// @ts-check
import tseslint from 'typescript-eslint'

export default tseslint.config(
  {
    // examples/**/*.js scripts run as @code bodies: code-runners.ts copies
    // them into a temp directory with no package.json above it, so Node
    // resolves plain .js there as CommonJS regardless of this repo's own
    // "type": "module" (no ancestor package.json to say otherwise). require()
    // is the architecturally correct form for these files, not a style lapse.
    // benchmarks/unused-exports/unused-exports.js is the same shape (a
    // @code body). The two ground-truth .cjs scripts (unused-exports and
    // import-graph) are a different reason for the same require() need:
    // each runs directly via `node` inside the repo tree (an independent
    // verification harness, not a @code body), where this repo's "type":
    // "module" would make plain .js ESM, so each deliberately opts into
    // CommonJS via the .cjs extension instead, same require().
    ignores: ['dist/**', 'node_modules/**', '.claude/**', 'examples/**/*.js', 'benchmarks/unused-exports/*.js', 'benchmarks/unused-exports/*.cjs', 'benchmarks/import-graph-ground-truth.cjs'],
  },
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-restricted-imports': 'off',
    },
  },
  // cli orchestrates the other modules; it is not imported by them. hook is
  // exempt: it must call the same code path as `cli render`, so it is
  // expected (required, verified by a test, not a lint rule since eslint can
  // only forbid an import, not require one) to import cli's render entry
  // point. Flat config does not merge `rules` values across matching blocks
  // for the same key, later wins, so every module's restrictions live in one
  // block rather than being split across per-concern blocks that would
  // silently overwrite each other.
  {
    files: ['src/parser/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [
          {
            group: ['livestage/renderer', '../renderer/*', '**/renderer/*'],
            message: 'parser must not import renderer (module boundary).',
          },
          {
            group: ['livestage/cli', '../cli/*', '**/cli/*'],
            message: 'cli orchestrates other modules; it must not be imported by them (module boundary).',
          },
        ],
      }],
    },
  },
  {
    files: ['src/engine/**/*.ts', 'src/renderer/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [{
          group: ['livestage/cli', '../cli/*', '**/cli/*'],
          message: 'cli orchestrates other modules; it must not be imported by them (module boundary).',
        }],
      }],
    },
  },
)
