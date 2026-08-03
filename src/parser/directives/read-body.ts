import type { ParseModule, ParseContext, DirectiveInput, ASTNode, ReadBodyNode } from '../types.js'

const readBody: ParseModule = {
  name: 'read-body',
  parse(input: DirectiveInput, ctx: ParseContext): ASTNode {
    const path = input.positional || input.attrs['path'] || ''
    const section = input.attrs['section'] ?? ''
    const node: ReadBodyNode = {
      type: 'read-body',
      line: ctx.line,
      path,
      section,
      args: { ...input.attrs },
    }
    return node
  },
}

export default readBody
