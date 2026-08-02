import type { ParseModule, ParseContext, DirectiveInput, ASTNode, ListNode } from '../types.js'
import { parseCacheAttrs } from './cache-attrs.js'

const list: ParseModule = {
  name: 'list',
  parse(input: DirectiveInput, ctx: ParseContext): ASTNode {
    const path = input.positional || input.attrs['path'] || ''
    const node: ListNode = {
      type: 'list',
      line: ctx.line,
      path,
      args: { ...input.attrs },
      cache: parseCacheAttrs(input.attrs),
    }
    return node
  },
}

export default list
