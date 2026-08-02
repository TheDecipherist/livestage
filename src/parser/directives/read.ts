import type { ParseModule, ParseContext, DirectiveInput, ASTNode, ReadNode } from '../types.js'
import { parseCacheAttrs } from './cache-attrs.js'

const read: ParseModule = {
  name: 'read',
  parse(input: DirectiveInput, ctx: ParseContext): ASTNode {
    const path = input.positional || input.attrs['path'] || ''
    const node: ReadNode = {
      type: 'read',
      line: ctx.line,
      path,
      args: { ...input.attrs },
      cache: parseCacheAttrs(input.attrs),
    }
    return node
  },
}

export default read
