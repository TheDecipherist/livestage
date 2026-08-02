import type { ParseModule, ParseContext, DirectiveInput, ASTNode, AssertNode } from '../types.js'
import { ParseError } from '../types.js'

const VALID_OPERATORS = new Set([
  'file-exists', 'contains', 'some-contains', 'contains-if-present', 'absent', 'json-key',
])

const assert: ParseModule = {
  name: 'assert',
  parse(input: DirectiveInput, ctx: ParseContext): ASTNode {
    const operator = input.attrs['operator'] ?? ''
    if (!operator) throw new ParseError('@assert requires operator=', ctx.line, ctx.filePath)
    if (!VALID_OPERATORS.has(operator)) {
      throw new ParseError(`@assert: unknown operator "${operator}"`, ctx.line, ctx.filePath)
    }
    const target = input.attrs['target'] ?? ''
    if (!target) throw new ParseError('@assert requires target=', ctx.line, ctx.filePath)
    const node: AssertNode = {
      type: 'assert',
      line: ctx.line,
      operator,
      target,
      pattern: input.attrs['pattern'] ?? null,
      key: input.attrs['key'] ?? null,
      equals: input.attrs['equals'] ?? null,
      label: input.attrs['label'] ?? null,
      args: { ...input.attrs },
    }
    return node
  },
}

export default assert
