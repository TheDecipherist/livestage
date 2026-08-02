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
  {
    files: ['src/parser/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [{
          group: ['livestage/renderer', '../renderer/*', '**/renderer/*'],
          message: 'parser must not import renderer (module boundary).',
        }],
      }],
    },
  },
  {
    files: ['src/hook/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [{
          group: ['../cli/*', '**/cli/*'],
          message: 'hook must call the same code path as cli render, not import cli directly (module boundary).',
        }],
      }],
    },
  },
)
