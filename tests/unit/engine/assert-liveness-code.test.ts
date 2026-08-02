import { describe, it, expect } from 'vitest'
import { parse } from 'livestage/parser'
import { checkUngrantedCodeLanguages } from '../../../src/engine/assert/liveness.js'

describe('checkUngrantedCodeLanguages', () => {
  it('flags a @code block whose language is not in the granted list', () => {
    const ast = parse('@code language="ruby"\nputs "hi"\n@code-end')
    const issues = checkUngrantedCodeLanguages(ast.nodes, { languages: ['python'], timeout: 30000, runners: {} })
    expect(issues).toHaveLength(1)
  })

  it('does not flag a granted language', () => {
    const ast = parse('@code language="python"\nprint("hi")\n@code-end')
    const issues = checkUngrantedCodeLanguages(ast.nodes, { languages: ['python'], timeout: 30000, runners: {} })
    expect(issues).toHaveLength(0)
  })

  it('flags every @code block against an empty (default) grant list', () => {
    const ast = parse('@code language="python"\nprint(1)\n@code-end')
    const issues = checkUngrantedCodeLanguages(ast.nodes, { languages: [], timeout: 30000, runners: {} })
    expect(issues).toHaveLength(1)
  })
})
