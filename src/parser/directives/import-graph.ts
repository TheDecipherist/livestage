import type { ParseModule, ParseContext, DirectiveInput, ASTNode, ImportGraphNode } from '../types.js'
import { ParseError } from '../types.js'

// @import-graph src="./src" [tsconfig="./tsconfig.json"] - walks a source
// tree and emits a Mermaid dependency graph directly, no @code/shell
// grant needed (see examples/import-graph/, the @code-based version this
// directive replaces). src is required, positional or named=, matching
// @list/@tree's own convention. tsconfig is optional: an explicit path to
// a tsconfig.json (or any tsconfig-shaped JSON) to resolve path aliases
// against, so this isn't limited to auto-discovering one next to src=;
// point it at anything (a monorepo package's own tsconfig, one with a
// nonstandard name or location, etc). Unset auto-discovers by walking up
// from src=.
const importGraph: ParseModule = {
  name: 'import-graph',
  parse(input: DirectiveInput, ctx: ParseContext): ASTNode {
    const src = input.positional || input.attrs['src'] || ''
    if (!src) throw new ParseError('@import-graph requires src=', ctx.line, ctx.filePath)
    const node: ImportGraphNode = {
      type: 'import-graph',
      line: ctx.line,
      src,
      tsconfig: input.attrs['tsconfig'] || null,
    }
    return node
  },
}

export default importGraph
