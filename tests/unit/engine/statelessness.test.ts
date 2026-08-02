import { describe, it, expect } from 'vitest'
import { parse } from 'livestage/parser'
import { execute } from '../../../src/engine/engine.js'

// CR-4 (No Daemon, No Memory): @set scopes to a single render pass. Two
// sequential renders of the same document must not see each other's @set
// values, no cross-invocation state store exists.
describe('CR-4: statelessness across invocations', () => {
  it('a second render does not see the first render\'s @set value', () => {
    const src = [
      '@if {{ counter }}',
      'seen: {{ counter }}',
      '@else',
      'unset',
      '@if-end',
      "@set counter = 'first-run' /",
    ].join('\n')
    const ast = parse(src)
    const first = execute(ast)
    const second = execute(ast)
    expect(first.output.trim()).toBe('unset')
    expect(second.output.trim()).toBe('unset')
  })

  it('makeContext-derived ctx.data does not persist between execute() calls', () => {
    const setDoc = parse("@set counter = 'value' /")
    const readDoc = parse('{{ counter }}')
    execute(setDoc)
    const result = execute(readDoc)
    expect(result.output.trim()).toBe('')
  })
})
