import type { ParseModule, ParseContext, DirectiveInput, ASTNode, ImportNode } from '../types.js'

const importDirective: ParseModule = {
  name: 'import',
  parse(input: DirectiveInput, ctx: ParseContext): ASTNode {
    const path = input.positional || input.attrs['path'] || ''
    const local = input.flags.includes('local') || input.attrs['local'] === 'true'
    const condition = input.attrs['if'] ?? null
    const node: ImportNode = {
      type: 'import',
      line: ctx.line,
      path,
      condition,
      local,
      // @import is side-effect only (registers macros/env fallbacks into
      // ctx, returns nothing renderable), so there is no single value to
      // cache; unlike @include, mock=/cache= are not accepted here.
      cache: null,
    }
    return node
  },
}

export default importDirective
