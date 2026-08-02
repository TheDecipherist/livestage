// Validate-time checks that go beyond syntax: inert assertion docs,
// suspicious (double-escaped) regex patterns, and args dereferenced with no
// absent-args fallback guard. All three are purely structural (AST-based),
// no filesystem execution, consistent with "validate never runs anything".
import type { ASTNode, AssertNode, ConditionalBranch } from 'livestage/parser'
import type { CodeSecurityConfig } from '../security/config.js'

export interface LivenessIssue {
  message: string
  line: number
}

function walk(nodes: ASTNode[], visit: (n: ASTNode) => void): void {
  for (const node of nodes) {
    visit(node)
    if (node.type === 'define') walk(node.body, visit)
    else if (node.type === 'conditional') node.branches.forEach((b: ConditionalBranch) => walk(b.body, visit))
    else if (node.type === 'foreach') walk(node.body, visit)
    else if (node.type === 'switch') {
      node.cases.forEach(c => walk(c.body, visit))
      if (node.defaultBody) walk(node.defaultBody, visit)
    }
  }
}

function collectAssertNodes(nodes: ASTNode[]): AssertNode[] {
  const found: AssertNode[] = []
  walk(nodes, n => { if (n.type === 'assert') found.push(n) })
  return found
}

// A document is inert when every @assert in it uses `absent`, the one
// operator permitted to pass vacuously: such a document can always pass
// trivially (nothing present to find) without ever verifying anything
// positive. Docs with zero assertions are not flagged here (not an
// assertion doc at all, out of this check's scope).
export function checkInertDoc(nodes: ASTNode[]): LivenessIssue | null {
  const asserts = collectAssertNodes(nodes)
  if (asserts.length === 0) return null
  const allAbsent = asserts.every(n => n.operator === 'absent')
  if (!allAbsent) return null
  return {
    message: 'every @assert in this document uses operator="absent"; the document can always pass without verifying anything positive (dead spec)',
    line: asserts[0]!.line,
  }
}

// A pattern= containing a literal double backslash immediately before a
// regex metacharacter letter (\\d, \\w, \\s, ...) almost always means the
// author intended a single escape (\d for "digit") and it got escaped
// twice, compiling to a literal backslash followed by a literal letter
// instead of the intended character class.
const DOUBLE_ESCAPE_RE = /\\\\[dwsDWSbBnrt]/

export function checkSuspiciousRegex(nodes: ASTNode[]): LivenessIssue[] {
  const issues: LivenessIssue[] = []
  walk(nodes, n => {
    if (n.type !== 'assert' || !n.pattern) return
    if (DOUBLE_ESCAPE_RE.test(n.pattern)) {
      issues.push({
        message: `@assert pattern looks double-escaped: "${n.pattern}" compiles to a literal backslash, not the intended character class; did you mean one fewer backslash?`,
        line: n.line,
      })
    }
  })
  return issues
}

const ARGS_INTERP_RE = /\b(args|arg0|arg1|arg2|arg3|argsList)\b/
const ARGS_GUARD_RE = /\b(args|arg0|arg1|arg2|arg3|argsList)\b/

function referencesArgs(text: string): boolean {
  return ARGS_INTERP_RE.test(text)
}

// Heuristic, not a control-flow proof: a document that interpolates args
// ANYWHERE and has no @if condition ANYWHERE referencing args is flagged.
// A document that guards some but not all args references still passes
// this check (matching "validate never executes anything", it cannot know
// which branch a given interpolation lives in without real evaluation).
export function checkArgsWithoutFallback(nodes: ASTNode[]): LivenessIssue | null {
  let usesArgs = false
  let hasGuard = false
  let firstLine = 0
  walk(nodes, n => {
    if (n.type === 'markdown') {
      for (const span of n.interpolations) {
        if (referencesArgs(span.expression)) {
          usesArgs = true
          if (firstLine === 0) firstLine = n.line
        }
      }
    }
    if (n.type === 'conditional') {
      for (const b of n.branches) {
        if (b.condition && ARGS_GUARD_RE.test(b.condition)) hasGuard = true
      }
    }
  })
  if (!usesArgs || hasGuard) return null
  return {
    message: '{{ args }}/{{ argN }} is dereferenced with no @if guard anywhere in the document; a passive (hook) render with no --args will render this literally empty with no fallback',
    line: firstLine,
  }
}

// Shared rule with feature 29 (Code Runners): a document using an ungranted
// @code language fails validate, the same way it fails at render runtime.
export function checkUngrantedCodeLanguages(nodes: ASTNode[], codeConfig: CodeSecurityConfig): LivenessIssue[] {
  const issues: LivenessIssue[] = []
  walk(nodes, n => {
    if (n.type !== 'code') return
    if (!codeConfig.languages.includes(n.language)) {
      issues.push({
        message: `@code language "${n.language}" is not granted (policy code.languages: [${codeConfig.languages.join(', ')}])`,
        line: n.line,
      })
    }
  })
  return issues
}
