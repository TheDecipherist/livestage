// @ts-check
import tseslint from 'typescript-eslint'

export default tseslint.config(
  {
    ignores: ['dist/**', 'node_modules/**', '.claude/**'],
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
