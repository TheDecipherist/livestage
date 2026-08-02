import { describe, it, expect } from 'vitest'
import { parse } from 'livestage/parser'
import { checkInertDoc, checkSuspiciousRegex, checkArgsWithoutFallback } from '../../../src/engine/assert/liveness.js'

// Wave 3, feature 27 (Assert Liveness): [new], no donor source. Purely
// structural (AST-based) checks, no filesystem execution, consistent with
// validate never running anything.
describe('checkInertDoc', () => {
  it('flags a document where every @assert uses operator=absent', () => {
    const ast = parse('@assert operator="absent" target="a.txt" pattern="x" /\n@assert operator="absent" target="b.txt" pattern="y" /')
    expect(checkInertDoc(ast.nodes)).not.toBeNull()
  })

  it('does not flag a document with at least one non-absent assertion', () => {
    const ast = parse('@assert operator="absent" target="a.txt" pattern="x" /\n@assert operator="file-exists" target="b.txt" /')
    expect(checkInertDoc(ast.nodes)).toBeNull()
  })

  it('does not flag a document with zero assertions (not an assertion doc)', () => {
    const ast = parse('# Hello\n\nJust prose.')
    expect(checkInertDoc(ast.nodes)).toBeNull()
  })

  it('recurses into @if branches to find assertions', () => {
    const ast = parse('@if true\n@assert operator="absent" target="a.txt" pattern="x" /\n@if-end')
    expect(checkInertDoc(ast.nodes)).not.toBeNull()
  })
})

describe('checkSuspiciousRegex', () => {
  it('flags a double-escaped pattern (two literal backslashes before d in the source)', () => {
    // Two real backslashes in the .stage source text: pattern="\\d+"
    const ast = parse('@assert operator="contains" target="a.txt" pattern="\\\\d+" /')
    const issues = checkSuspiciousRegex(ast.nodes)
    expect(issues).toHaveLength(1)
  })

  it('does not flag a correctly single-escaped pattern (one backslash in the source)', () => {
    // One real backslash in the .stage source text: pattern="\d+"
    const ast = parse('@assert operator="contains" target="a.txt" pattern="\\d+" /')
    expect(checkSuspiciousRegex(ast.nodes)).toHaveLength(0)
  })

  it('does not flag a pattern with no backslashes at all', () => {
    const ast = parse('@assert operator="contains" target="a.txt" pattern="hello" /')
    expect(checkSuspiciousRegex(ast.nodes)).toHaveLength(0)
  })
})

describe('checkArgsWithoutFallback', () => {
  it('flags {{ args }} dereferenced with no @if guard anywhere in the document', () => {
    const ast = parse('value={{ args }}')
    expect(checkArgsWithoutFallback(ast.nodes)).not.toBeNull()
  })

  it('flags {{ arg0 }} the same way', () => {
    const ast = parse('value={{ arg0 }}')
    expect(checkArgsWithoutFallback(ast.nodes)).not.toBeNull()
  })

  it('does not flag when an @if guard referencing args exists anywhere in the doc', () => {
    const ast = parse('@if {{ args }}\nvalue={{ args }}\n@if-end')
    expect(checkArgsWithoutFallback(ast.nodes)).toBeNull()
  })

  it('does not flag a document that never references args at all', () => {
    const ast = parse('# Hello\n\nNo args here.')
    expect(checkArgsWithoutFallback(ast.nodes)).toBeNull()
  })
})
