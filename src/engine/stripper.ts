import { runInNewContext } from 'node:vm'
import type { ASTNode, ParseResult, InterpolationSpan } from 'livestage/parser'

const SAFE_ENV_KEY = /^[A-Z_][A-Z0-9_]*$/i

export interface StripOptions {
  env?: Record<string, string>
}

export interface StripResult {
  output: string
  warnings: string[]
}

function evalConditionForStrip(condition: string, env: Record<string, string>, warnings: string[]): boolean {
  try { return Boolean(runInNewContext(condition, { ...env }, { timeout: 200 })) } catch (err) {
    warnings.push(`strip: condition eval failed — "${condition}": ${String(err)}`)
    return false
  }
}

function resolveInterpolation(expr: string, env: Record<string, string>, warnings: string[]): string {
  const trimmed = expr.trim()
  if (/^[A-Z_][A-Z0-9_]*$/.test(trimmed)) return env[trimmed] ?? ''
  try { return String(runInNewContext(trimmed, { ...env }, { timeout: 200 }) ?? '') } catch (err) {
    warnings.push(`strip: interpolation failed — "${trimmed}": ${String(err)}`)
    return ''
  }
}

function stripInterpolations(text: string, spans: InterpolationSpan[], env: Record<string, string>, warnings: string[]): string {
  if (spans.length === 0) return text
  let result = ''
  let pos = 0
  for (const span of spans) {
    result += text.slice(pos, span.start)
    result += span.escaped ? `{{${span.expression}}}` : resolveInterpolation(span.expression, env, warnings)
    pos = span.end
  }
  return result + text.slice(pos)
}

function collectParts(nodes: ASTNode[], env: Record<string, string>, warnings: string[]): string[] {
  const parts: string[] = []
  for (const n of nodes) {
    const out = stripNode(n, env, warnings)
    if (out !== '' || (n.type === 'markdown' && n.text.trim() === '')) parts.push(out)
  }
  return parts
}

function stripNode(node: ASTNode, env: Record<string, string>, warnings: string[]): string {
  switch (node.type) {
    case 'include': return ''
    case 'import': return ''
    case 'env': return ''
    case 'transition': return ''
    case 'render': return ''
    case 'call': return ''
    case 'define': return ''
    case 'list': return ''
    case 'read': return ''
    case 'query': return ''
    case 'tree': return ''
    case 'date': return ''
    case 'count': return ''
    case 'pipe': return ''
    case 'graph': return node.raw
    case 'passthrough': return node.raw.trimStart().startsWith('@markdownai') ? '' : node.raw
    case 'markdown': return stripInterpolations(node.text, node.interpolations, env, warnings)
    case 'conditional': {
      for (const branch of node.branches) {
        if (branch.condition === null) return collectParts(branch.body, env, warnings).join('\n').trimStart()
        const unset = [...branch.condition.matchAll(/\b([A-Z_][A-Z0-9_]*)\b/g)]
          .map(m => m[1]!)
          .filter(v => !(v in env))
        for (const v of unset) {
          if (!warnings.includes(`Unset variable in @if: ${v}`)) warnings.push(`Unset variable in @if: ${v}`)
        }
        if (evalConditionForStrip(branch.condition, env, warnings)) return collectParts(branch.body, env, warnings).join('\n').trimStart()
      }
      return ''
    }
    // Write directives produce no user-visible markdown when stripped, the
    // strip mode is for extracting prose, not for running write ops.
    case 'update-frontmatter':
    case 'test':
    case 'check':
    case 'set':
    case 'switch':
    case 'foreach':
    case 'hash':
    case 'read-frontmatter':
    case 'template':
    case 'data':
      return ''
    default:
      throw new Error(`stripNode: unhandled AST node type "${(node as ASTNode).type}"`)

  }
}

export function strip(ast: ParseResult, options?: StripOptions): StripResult {
  if (!ast.isLiveStage) {
    return { output: '', warnings: ['Not a LiveStage document'] }
  }
  const env: Record<string, string> = {}
  for (const [k, v] of Object.entries(process.env)) {
    if (v !== undefined && SAFE_ENV_KEY.test(k)) env[k] = v
  }
  if (options?.env) Object.assign(env, options.env)

  const warnings: string[] = []
  const parts = collectParts(ast.nodes, env, warnings)
  const output = parts.join('\n').trimStart()
  return { output, warnings }
}
