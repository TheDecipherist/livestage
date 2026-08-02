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
  },
})
