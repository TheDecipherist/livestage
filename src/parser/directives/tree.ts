import type { ParseModule, ParseContext, DirectiveInput, ASTNode, TreeNode } from '../types.js'
import { parseCacheAttrs } from './cache-attrs.js'

const tree: ParseModule = {
  name: 'tree',
  parse(input: DirectiveInput, ctx: ParseContext): ASTNode {
    const path = input.positional || input.attrs['path'] || ''
    const node: TreeNode = {
      type: 'tree',
      line: ctx.line,
      path,
      args: { ...input.attrs },
      cache: parseCacheAttrs(input.attrs),
    }
    return node
  },
}

export default tree
