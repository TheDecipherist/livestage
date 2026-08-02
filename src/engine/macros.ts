import type {
  ASTNode, ConditionalBranch, PipeStage,
  IncludeNode, ImportNode, ListNode, ReadNode, TreeNode, CountNode,
  QueryNode, DateNode, RenderNode, CallNode, SwitchNode,
} from 'livestage/parser'
import { scanInterpolations } from 'livestage/parser'

export function substituteParams(body: ASTNode[], args: Record<string, string>): ASTNode[] {
  return body.map(node => substituteNode(node, args))
}

function subStr(s: string, args: Record<string, string>): string {
  let r = s
  for (const [k, v] of Object.entries(args)) {
    // Escape regex metacharacters in the key before building the pattern
    const escapedKey = k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    // Escape $ in the value so String.replace doesn't interpret $1, $&, etc.
    const safeValue = v.replace(/\$/g, '$$$$')
    r = r.replace(new RegExp(`\\{\\{\\s*${escapedKey}\\s*\\}\\}`, 'g'), safeValue)
  }
  return r
}

function subArgs(a: Record<string, string>, args: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(a).map(([k, v]) => [k, subStr(v, args)]))
}

function substituteNode(node: ASTNode, args: Record<string, string>): ASTNode {
  switch (node.type) {
    case 'markdown': {
      const text = subStr(node.text, args)
      return { ...node, text, interpolations: scanInterpolations(text) }
    }
    case 'define':
      return { ...node, body: substituteParams(node.body, args) }
    case 'conditional': {
      const branches: ConditionalBranch[] = node.branches.map(b => ({
        ...b,
        body: substituteParams(b.body, args),
      }))
      return { ...node, branches }
    }
    case 'switch': {
      const cases = (node as SwitchNode).cases.map(c => ({
        ...c,
        body: substituteParams(c.body, args),
      }))
      const defaultBody = (node as SwitchNode).defaultBody !== null
        ? substituteParams((node as SwitchNode).defaultBody!, args)
        : null
      return { ...(node as SwitchNode), cases, defaultBody }
    }
    case 'include':
      return { ...node as IncludeNode, path: subStr(node.path, args) }
    case 'import':
      return { ...node as ImportNode, path: subStr(node.path, args) }
    case 'list':
      return { ...node as ListNode, path: subStr(node.path, args), args: subArgs(node.args, args) }
    case 'read':
      return { ...node as ReadNode, path: subStr(node.path, args), args: subArgs(node.args, args) }
    case 'tree':
      return { ...node as TreeNode, path: subStr(node.path, args), args: subArgs(node.args, args) }
    case 'count':
      return { ...node as CountNode, path: subStr(node.path, args), args: subArgs(node.args, args) }
    case 'query':
      return { ...node as QueryNode, command: subStr(node.command, args), args: subArgs(node.args, args) }
    case 'date':
      return { ...node as DateNode, args: subArgs(node.args, args) }
    case 'update-frontmatter':
      return {
        ...node,
        path: subStr(node.path, args),
        field: subStr(node.field, args),
        value: subStr(node.value, args),
        args: subArgs(node.args, args),
      }
    case 'read-frontmatter':
      return {
        ...node,
        path: subStr(node.path, args),
        field: subStr(node.field, args),
        args: subArgs(node.args, args),
      }
    case 'test':
    case 'check':
      return {
        ...node,
        command: node.command === null ? null : subStr(node.command, args),
        args: subArgs(node.args, args),
      }
    case 'hash':
      return {
        ...node,
        path: subStr(node.path, args),
        args: subArgs(node.args, args),
      }
    case 'foreach':
      return {
        ...node,
        literalSource: node.literalSource === null ? null : subStr(node.literalSource, args),
        body: node.body.map(n => substituteNode(n, args)),
        args: subArgs(node.args, args),
      }
    case 'set':
      return {
        ...node,
        literalExpr: node.literalExpr === null ? null : subStr(node.literalExpr, args),
        args: subArgs(node.args, args),
      }
    case 'render':
      return { ...node as RenderNode, args: subArgs(node.args, args) }
    case 'call': {
      const n = node as CallNode
      return {
        ...n,
        args: subArgs(n.args, args),
        positionalArgs: n.positionalArgs.map(v => subStr(v, args)),
      }
    }
    case 'pipe': {
      const stages: PipeStage[] = node.stages.map(s => {
        if (s.type === 'source') return { ...s, node: substituteNode(s.node, args) }
        if (s.type === 'builtin') return { ...s, command: subStr(s.command, args) }
        if (s.type === 'shell') return { ...s, command: subStr(s.command, args) }
        if (s.type === 'sink') return { ...s, node: { ...s.node, args: subArgs(s.node.args, args) } }
        return s
      })
      return { ...node, stages }
    }
    // transition, env, graph, passthrough: no user-visible string params to substitute
    case 'transition':
    case 'env':
    case 'graph':
    case 'passthrough':
      return node
    case 'template':
      return {
        ...node,
        path: subStr(node.path, args),
        dataExpr: node.dataExpr === null ? null : subStr(node.dataExpr, args),
      }
    case 'data':
      return {
        ...node,
        entries: node.entries.map(e => e.kind === 'spread'
          ? { ...e, rhs: subStr(e.rhs, args) }
          : { ...e, rhs: subStr(e.rhs, args) }),
      }
    default:
      throw new Error(`substituteNode: unhandled AST node type "${(node as { type: string }).type}"`)

  }
}
