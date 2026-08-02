import { describe, it, expect } from 'vitest'
import { parse } from '../../../src/parser/index.js'
import type {
  ASTNode, IncludeNode, ImportNode, EnvNode, DefineNode, CallNode, ListNode,
} from '../../../src/parser/types.js'

function node<T extends ASTNode>(nodes: ASTNode[], index: number): T {
  const n = nodes[index]
  if (n === undefined) throw new Error(`No node at index ${index} (length ${nodes.length})`)
  return n as T
}

describe('Parser', () => {
  describe('frontmatter version pin', () => {
    it('reads livestage: 1 from frontmatter as the version pin', () => {
      const result = parse('---\nlivestage: 1\ntitle: test\n---\n# Hello')
      expect(result.version).toBe('1')
    })

    it('version is null when frontmatter has no livestage: field', () => {
      const result = parse('---\ntitle: test\n---\n# Hello')
      expect(result.version).toBeNull()
    })

    it('version is null when there is no frontmatter at all', () => {
      const result = parse('# Hello')
      expect(result.version).toBeNull()
    })

    it('frontmatter lines are still emitted as markdown nodes (opaque otherwise)', () => {
      const result = parse('---\nlivestage: 1\n---\nBody')
      expect(result.nodes[0]?.type).toBe('markdown')
    })
  })

  describe('@include directive /', () => {
    it('parses @include with a path', () => {
      const result = parse('@include ./sections/footer.md /')
      const n = node<IncludeNode>(result.nodes, 0)
      expect(n.type).toBe('include')
      expect(n.path).toBe('./sections/footer.md')
      expect(n.condition).toBeNull()
      expect(n.local).toBe(false)
    })

    it('parses @include with condition', () => {
      const result = parse('@include ./debug.md if env.NODE_ENV == "development" /')
      const n = node<IncludeNode>(result.nodes, 0)
      expect(n.condition).toBe('env.NODE_ENV == "development"')
    })

    it('parses @include with @local flag', () => {
      const result = parse('@include ./local.md @local /')
      const n = node<IncludeNode>(result.nodes, 0)
      expect(n.local).toBe(true)
    })

    it('parses line number correctly', () => {
      const result = parse('@include ./footer.md /')
      const n = node<IncludeNode>(result.nodes, 0)
      expect(n.line).toBe(1)
    })
  })

  describe('@import directive /', () => {
    it('parses @import with a path', () => {
      const result = parse('@import ./shared/defaults.md /')
      const n = node<ImportNode>(result.nodes, 0)
      expect(n.type).toBe('import')
      expect(n.path).toBe('./shared/defaults.md')
      expect(n.condition).toBeNull()
    })
  })

  describe('@env directive /', () => {
    it('parses @env with name and fallback', () => {
      const result = parse('@env COMPANY_NAME fallback="My Company" /')
      const n = node<EnvNode>(result.nodes, 0)
      expect(n.type).toBe('env')
      expect(n.name).toBe('COMPANY_NAME')
      expect(n.fallback).toBe('My Company')
    })

    it('parses @env name-only has null fallback', () => {
      const result = parse('@env REQUIRED_VAR /')
      const n = node<EnvNode>(result.nodes, 0)
      expect(n.name).toBe('REQUIRED_VAR')
      expect(n.fallback).toBeNull()
    })
  })

  describe('@define block directive', () => {
    it('parses @define ... @end block', () => {
      const result = parse('@define footer\nSome footer content\n@define-end')
      const n = node<DefineNode>(result.nodes, 0)
      expect(n.type).toBe('define')
      expect(n.name).toBe('footer')
      expect(n.body.length).toBeGreaterThan(0)
    })

    it('parses @define with @local flag', () => {
      const result = parse('@define user_row @local\ncontent\n@define-end')
      const n = node<DefineNode>(result.nodes, 0)
      expect(n.local).toBe(true)
    })

    it('parses @define with bare local keyword (no @ prefix)', () => {
      const result = parse('@define greeter local\nHi\n@define-end')
      const n = node<DefineNode>(result.nodes, 0)
      expect(n.local).toBe(true)
      expect(n.name).toBe('greeter')
    })

    it('does not treat "local" as the marker when it appears inside the name', () => {
      const result = parse('@define localish\ncontent\n@define-end')
      const n = node<DefineNode>(result.nodes, 0)
      expect(n.local).toBe(false)
      expect(n.name).toBe('localish')
    })

    it('parses no params when no parens', () => {
      const result = parse('@define footer\ncontent\n@define-end')
      const n = node<DefineNode>(result.nodes, 0)
      expect(n.params).toEqual([])
    })

    it('parses @define name(param) syntax — single param', () => {
      const result = parse('@define greet(name)\nHello {{name}}\n@define-end')
      const n = node<DefineNode>(result.nodes, 0)
      expect(n.name).toBe('greet')
      expect(n.params).toEqual(['name'])
    })

    it('parses @define name(param1, param2) syntax — multiple params', () => {
      const result = parse('@define row(title, value)\n{{title}}: {{value}}\n@define-end')
      const n = node<DefineNode>(result.nodes, 0)
      expect(n.name).toBe('row')
      expect(n.params).toEqual(['title', 'value'])
    })

    it('parses @define name(param) @local', () => {
      const result = parse('@define cell(content) @local\n{{content}}\n@define-end')
      const n = node<DefineNode>(result.nodes, 0)
      expect(n.name).toBe('cell')
      expect(n.params).toEqual(['content'])
      expect(n.local).toBe(true)
    })

    it('allows @on complete -> next nested inside @if within @define (placed in conditional body)', () => {
      const result = parse('@define probe @local\n@if {{ disabled }}\n@on-complete next /\n@if-end\nbody\n@define-end')
      const n = node<DefineNode>(result.nodes, 0)
      expect(n.type).toBe('define')
      // The nested @on lives in the conditional branch body, not on the define's transitions
      expect(n.transitions).toEqual([])
      const conditional = n.body.find(b => b.type === 'conditional')
      expect(conditional).toBeDefined()
    })

    it('initializes empty transitions array when @define has no @on', () => {
      const result = parse('@define plain\ncontent\n@define-end')
      const n = node<DefineNode>(result.nodes, 0)
      expect(n.transitions).toEqual([])
    })
  })

  describe('@call directive /', () => {
    it('parses @call with macro name', () => {
      const result = parse('@call footer /')
      const n = node<CallNode>(result.nodes, 0)
      expect(n.type).toBe('call')
      expect(n.name).toBe('footer')
    })

    it('parses @call with key=value args', () => {
      const result = parse('@call header title="My Doc" /')
      const n = node<CallNode>(result.nodes, 0)
      expect(n.args['title']).toBe('My Doc')
    })

    it('parses @call name(arg1, arg2) positional paren syntax', () => {
      const result = parse('@call greet(Alice, Admin) /')
      const n = node<CallNode>(result.nodes, 0)
      expect(n.name).toBe('greet')
      expect(n.positionalArgs).toEqual(['Alice', 'Admin'])
      expect(n.args).toEqual({})
    })

    it('parses @call name(key=value) named paren syntax', () => {
      const result = parse('@call row(title=Hello, value=World) /')
      const n = node<CallNode>(result.nodes, 0)
      expect(n.name).toBe('row')
      expect(n.args['title']).toBe('Hello')
      expect(n.args['value']).toBe('World')
      expect(n.positionalArgs).toEqual([])
    })
  })

  describe('@list directive /', () => {
    it('parses @list with path and named args', () => {
      const result = parse('@list ./src/ match="**/*.ts" /')
      const n = node<ListNode>(result.nodes, 0)
      expect(n.type).toBe('list')
      expect(n.path).toBe('./src/')
      expect(n.args['match']).toBe('**/*.ts')
    })
  })

})
