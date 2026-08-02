import { defineConfig } from 'vitest/config'
import { resolve } from 'node:path'

const root = import.meta.dirname

export default defineConfig({
  resolve: {
    alias: {
      'livestage/parser': resolve(root, 'src/parser/index.ts'),
      'livestage/engine': resolve(root, 'src/engine/index.ts'),
      'livestage/renderer': resolve(root, 'src/renderer/index.ts'),
    },
  },
  test: {
    include: ['tests/**/*.test.ts'],
    // Dual reporters: 'default' is what a human sees, 'json' feeds CR-7's
    // automated baseline check (scripts/check-test-baseline.mjs) without
    // running the suite a second time just to get a count. The json output
    // is a generated artifact (gitignored), not committed.
    reporters: ['default', 'json'],
    outputFile: { json: '.vitest-results.json' },
  },
})
