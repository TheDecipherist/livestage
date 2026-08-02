import { readFileSync } from 'node:fs'
import type { GraphNode } from 'livestage/parser'
import type { EngineContext } from './context.js'
import { resolveAssertTargets } from './assert/operators.js'
import { readFrontmatterField } from './frontmatter-utils.js'

interface GraphEdge {
  from: string
  to: string
}

export interface GraphResult {
  nodes: string[]
  edges: GraphEdge[]
  cycles: string[][]
  broken: string[]  // "from -> to" for each edge whose target id is not a known node
}

// A frontmatter list field (depends_on: [a, b] or a block list) comes back
// from readFrontmatterField as a single comma-joined string; split it back
// into tokens. Good enough for id-shaped values (no embedded commas).
function splitListField(raw: string): string[] {
  return raw.split(',').map(s => s.trim()).filter(Boolean)
}

function buildGraph(node: GraphNode, ctx: EngineContext): GraphResult {
  const files = resolveAssertTargets(node.target, ctx)
  const idToFile = new Map<string, string>()
  const rawEdges: GraphEdge[] = []

  for (const file of files) {
    let content: string
    try { content = readFileSync(file, 'utf8') } catch { continue }
    const id = readFrontmatterField(content, node.idField)
    if (!id) continue
    idToFile.set(id, file)
    const relationRaw = readFrontmatterField(content, node.relation)
    if (!relationRaw) continue
    for (const target of splitListField(relationRaw)) {
      rawEdges.push({ from: id, to: target })
    }
  }

  const nodes = [...idToFile.keys()].sort()
  const nodeSet = new Set(nodes)
  const edges = rawEdges.filter(e => nodeSet.has(e.from))
  const broken = edges.filter(e => !nodeSet.has(e.to)).map(e => `${e.from} -> ${e.to}`)
  const validEdges = edges.filter(e => nodeSet.has(e.to))
  const cycles = detectCycles(nodes, validEdges)

  return { nodes, edges: validEdges, cycles, broken }
}

// Standard DFS cycle detection with a recursion-stack path, so each
// reported cycle is the actual node sequence, not just "a cycle exists".
function detectCycles(nodes: string[], edges: GraphEdge[]): string[][] {
  const adjacency = new Map<string, string[]>()
  for (const n of nodes) adjacency.set(n, [])
  for (const e of edges) adjacency.get(e.from)?.push(e.to)

  const cycles: string[][] = []
  const visited = new Set<string>()
  const stack: string[] = []
  const onStack = new Set<string>()

  function visit(node: string): void {
    visited.add(node)
    stack.push(node)
    onStack.add(node)
    for (const next of adjacency.get(node) ?? []) {
      if (onStack.has(next)) {
        const cycleStart = stack.indexOf(next)
        cycles.push([...stack.slice(cycleStart), next])
      } else if (!visited.has(next)) {
        visit(next)
      }
    }
    stack.pop()
    onStack.delete(node)
  }

  for (const n of nodes) {
    if (!visited.has(n)) visit(n)
  }
  return cycles
}

function renderTree(result: GraphResult): string {
  const children = new Map<string, string[]>()
  const hasParent = new Set<string>()
  for (const n of result.nodes) children.set(n, [])
  for (const e of result.edges) {
    children.get(e.to)?.push(e.from)  // dependents of e.to
    hasParent.add(e.from)
  }
  const roots = result.nodes.filter(n => !hasParent.has(n))
  const lines: string[] = []
  const rendered = new Set<string>()
  function walk(node: string, depth: number, seen: Set<string>): void {
    lines.push(`${'  '.repeat(depth)}- ${node}`)
    rendered.add(node)
    if (seen.has(node)) return  // cycle guard, do not recurse infinitely
    const next = new Set(seen)
    next.add(node)
    for (const child of children.get(node) ?? []) walk(child, depth + 1, next)
  }
  for (const root of roots) walk(root, 0, new Set())
  // A node entirely inside a cycle with no path from any root (every node
  // in its connected component has a parent) is never reached above; walk
  // it too so it isn't silently dropped from the tree.
  for (const node of result.nodes) {
    if (!rendered.has(node)) walk(node, 0, new Set())
  }
  return lines.join('\n')
}

function renderTable(result: GraphResult): string {
  const lines = ['| from | to |', '|------|----|']
  for (const e of result.edges) lines.push(`| ${e.from} | ${e.to} |`)
  return lines.join('\n')
}

function renderMermaid(result: GraphResult): string {
  const cycleNodes = new Set(result.cycles.flat())
  const brokenFrom = new Set(result.broken.map(b => b.split(' -> ')[0]))
  const lines = ['```mermaid', 'graph TD']
  for (const n of result.nodes) lines.push(`  ${n}`)
  for (const e of result.edges) lines.push(`  ${e.from} --> ${e.to}`)
  if (cycleNodes.size > 0) {
    lines.push('  classDef cycle fill:#f88,stroke:#900')
    lines.push(`  class ${[...cycleNodes].join(',')} cycle`)
  }
  if (brokenFrom.size > 0) {
    lines.push('  classDef broken fill:#fd8,stroke:#960')
    lines.push(`  class ${[...brokenFrom].join(',')} broken`)
  }
  lines.push('```')
  return lines.join('\n')
}

export function executeGraph(node: GraphNode, ctx: EngineContext): string {
  const result = buildGraph(node, ctx)
  const body = node.format === 'table' ? renderTable(result)
    : node.format === 'mermaid' ? renderMermaid(result)
    : renderTree(result)

  if (node.label) {
    ctx.data[node.label] = {
      _nodes: result.nodes.length,
      _edges: result.edges.length,
      _cycles: result.cycles.length,
      _broken: result.broken.length,
      _broken_list: result.broken,
    }
    ctx.envFiles[node.label] = body
  }
  return body
}
