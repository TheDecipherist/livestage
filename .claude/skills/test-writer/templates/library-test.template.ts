// Library / pure-function test scaffold. Libraries have almost no standard tier:
// no auth, no HTTP, no response envelope. So most of the file is FEATURE-specific
// behavior. The only reusable pieces are a small call-and-capture helper and a
// fixture prefix. Keep them local and tiny, this is not where templating pays off.

import { describe, it, expect } from 'vitest'
// PROJECT: import the unit under test
// import { parse } from '../parser.js'

// PROJECT: optional one-line extract helper and fixture prefix, if useful
// const DOC = '@markdownai\n'
// function node(src: string) {
//   return parse(DOC + src).nodes.find((n) => n.type === 'X')
// }

describe('UNIT', () => {
  // FEATURE tier dominates. One test per documented behavior and edge case.
  // Assert specific outputs, cover null / empty / boundary / wrong-type, and
  // assert that invalid input THROWS rather than silently returning a default,
  // that silent default is the failure mode a weak test hides.
  it('does THE DOCUMENTED THING for a valid input', () => {
    // expect(fn(input)).toBe(expected)
  })

  it('throws on invalid input instead of returning a default', () => {
    // expect(() => fn(badInput)).toThrow()
  })
})
