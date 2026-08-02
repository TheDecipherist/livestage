import type { ParseModule, ParseContext, DirectiveInput, ASTNode, GraphNode } from '../types.js'
import { ParseError } from '../types.js'

const VALID_FORMATS = new Set(['tree', 'table', 'mermaid'])

const graph: ParseModule = {
  name: 'graph',
  parse(input: DirectiveInput, ctx: ParseContext): ASTNode {
    const target = input.attrs['target'] ?? ''
    if (!target) throw new ParseError('@graph requires target=', ctx.line, ctx.filePath)
    const format = input.attrs['format'] ?? 'tree'
    if (!VALID_FORMATS.has(format)) {
      throw new ParseError(`@graph: unknown format "${format}" (expected tree|table|mermaid)`, ctx.line, ctx.filePath)
    }
    const node: GraphNode = {
      type: 'graph',
      line: ctx.line,
      target,
      relation: input.attrs['relation'] ?? 'depends_on',
      idField: input.attrs['id-field'] ?? 'id',
      format: format as 'tree' | 'table' | 'mermaid',
      label: input.attrs['label'] ?? null,
    }
    return node
  },
}

export default graph
