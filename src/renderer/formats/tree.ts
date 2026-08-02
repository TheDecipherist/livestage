import type { FormatModule, RendererInput } from '../types.js'

function parseRow(line: string): string[] {
  return line.split('\t').map(c => c.trim())
}

interface TreeGroup {
  children: Map<string, TreeGroup>
  annotation: string | null
}

function newGroup(): TreeGroup {
  return { children: new Map(), annotation: null }
}

function insert(root: TreeGroup, breadcrumb: string, annotation: string): void {
  const segments = breadcrumb.split('/').filter(Boolean)
  let cur = root
  for (const seg of segments) {
    let next = cur.children.get(seg)
    if (!next) { next = newGroup(); cur.children.set(seg, next) }
    cur = next
  }
  cur.annotation = annotation
}

function renderGroup(node: TreeGroup, depth: number, lines: string[]): void {
  for (const [name, child] of node.children) {
    const suffix = child.annotation ? ` (${child.annotation})` : ''
    lines.push(`${'  '.repeat(depth)}- ${name}${suffix}`)
    renderGroup(child, depth + 1, lines)
  }
}

const tree: FormatModule = {
  name: 'tree',
  render(input: RendererInput): string {
    const { data, columns } = input
    if (data.length === 0) return '```\n```'

    const hasExplicitColumns = columns !== undefined && columns.length > 0
    const headers = hasExplicitColumns ? columns! : (data[0] ? parseRow(data[0]) : [])
    const rows = hasExplicitColumns ? data.map(parseRow) : data.slice(1).map(parseRow)

    // Plain single-column data (no tab-separated annotation columns) has no
    // breadcrumb to group by; keep the original passthrough behavior, a
    // fenced block of raw lines, e.g. @tree's own directory-drawing output
    // piped straight through @render type="tree".
    if (headers.length <= 1) {
      return `\`\`\`\n${data.join('\n')}\n\`\`\``
    }

    // F-FM-QUERY (feature 36): column one is a slash-delimited breadcrumb
    // (the tree key), remaining columns annotate the leaf, e.g. a projected
    // `@list ... fields="path,status,wave"` row grouping feature docs under
    // their wave.
    const root = newGroup()
    for (const row of rows) {
      const breadcrumb = row[0] ?? ''
      if (!breadcrumb) continue
      const annotation = headers.slice(1).map((h, i) => `${h}: ${row[i + 1] ?? ''}`).join(', ')
      insert(root, breadcrumb, annotation)
    }
    const lines: string[] = []
    renderGroup(root, 0, lines)
    return lines.join('\n')
  },
}

export default tree
