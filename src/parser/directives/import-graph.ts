import type { ParseModule, ParseContext, DirectiveInput, ASTNode, ImportGraphNode } from '../types.js'
import { ParseError } from '../types.js'

// @import-graph src="./src" - walks a source tree and emits a Mermaid
// dependency graph directly, no @code/shell grant needed (see
// examples/import-graph/, the @code-based version this directive
// replaces). One required argument, positional or named=, matching
// @list/@tree's own convention.
const importGraph: ParseModule = {
  name: 'import-graph',
  parse(input: DirectiveInput, ctx: ParseContext): ASTNode {
    const src = input.positional || input.attrs['src'] || ''
    if (!src) throw new ParseError('@import-graph requires src=', ctx.line, ctx.filePath)
    const node: ImportGraphNode = {
      type: 'import-graph',
      line: ctx.line,
      src,
    }
    return node
  },
}

export default importGraph
