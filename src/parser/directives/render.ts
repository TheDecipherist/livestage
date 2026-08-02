import type { ParseModule, ParseContext, DirectiveInput, ASTNode, RenderNode } from '../types.js'

const render: ParseModule = {
  name: 'render',
  parse(input: DirectiveInput, ctx: ParseContext): ASTNode {
    const args = { ...input.attrs }
    // Bare positional form (`@render table /`, `@render tree /`) is sugar
    // for `type=`, matching how the spec itself writes render stages
    // throughout (`| @render table`, `@render tree`). Explicit type=
    // still wins if both are somehow given.
    if (!args['type'] && input.positional) args['type'] = input.positional
    const node: RenderNode = { type: 'render', line: ctx.line, args }
    return node
  },
}

export default render
