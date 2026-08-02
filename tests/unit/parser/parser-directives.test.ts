import { describe, it, expect } from 'vitest'
import { parse } from '../../../src/parser/parser.js'
import type { ASTNode, ReadNode, QueryNode, DateNode, GraphNode, TreeNode, CountNode } from '../../../src/parser/types.js'

function node<T extends ASTNode>(nodes: ASTNode[], idx: number): T {
  return nodes[idx] as T
}

describe('Parser — missing directive coverage', () => {
  describe('@read directive /', () => {
    it('parses @read with path', () => {
      const result = parse('@markdownai\n@read ./docs/file.txt /')
      expect(result.nodes).toHaveLength(2)
      const n = node<ReadNode>(result.nodes, 1)
      expect(n.type).toBe('read')
      expect(n.path).toBe('./docs/file.txt')
    })

    it('parses @read with named args', () => {
      const result = parse('@markdownai\n@read ./data.csv lines=10 /')
      const n = node<ReadNode>(result.nodes, 1)
      expect(n.type).toBe('read')
      expect(n.args['lines']).toBe('10')
    })
  })

  describe('@query directive /', () => {
    it('parses @query with command', () => {
      const result = parse('@markdownai\n@query "SELECT * FROM users" /')
      const n = node<QueryNode>(result.nodes, 1)
      expect(n.type).toBe('query')
      expect(n.command).toBe('SELECT * FROM users')
    })

    it('parses @query with named args', () => {
      const result = parse('@markdownai\n@query "SELECT id FROM t" limit=5 /')
      const n = node<QueryNode>(result.nodes, 1)
      expect(n.args['limit']).toBe('5')
    })
  })

  describe('@date directive /', () => {
    it('parses @date with no args', () => {
      const result = parse('@markdownai\n@date /')
      const n = node<DateNode>(result.nodes, 1)
      expect(n.type).toBe('date')
    })

    it('parses @date with format arg', () => {
      const result = parse('@markdownai\n@date format="YYYY-MM-DD" /')
      const n = node<DateNode>(result.nodes, 1)
      expect(n.args['format']).toBe('YYYY-MM-DD')
    })
  })

  describe('@graph directive /', () => {
    it('parses graph fenced block', () => {
      const result = parse('@markdownai\n```mai-graph\nA --> B\nB --> C\n```')
      const n = node<GraphNode>(result.nodes, 1)
      expect(n.type).toBe('graph')
      expect(n.raw).toContain('A --> B')
    })
  })

  describe('@tree directive /', () => {
    it('parses @tree with path', () => {
      const result = parse('@markdownai\n@tree ./src /')
      const n = node<TreeNode>(result.nodes, 1)
      expect(n.type).toBe('tree')
      expect(n.path).toBe('./src')
    })

    it('parses @tree with depth arg', () => {
      const result = parse('@markdownai\n@tree ./src depth=2 /')
      const n = node<TreeNode>(result.nodes, 1)
      expect(n.args['depth']).toBe('2')
    })
  })

  describe('@count directive /', () => {
    it('parses @count with path', () => {
      const result = parse('@markdownai\n@count ./src /')
      const n = node<CountNode>(result.nodes, 1)
      expect(n.type).toBe('count')
      expect(n.path).toBe('./src')
    })

    it('parses @count with pattern arg', () => {
      const result = parse('@markdownai\n@count ./src pattern=*.ts /')
      const n = node<CountNode>(result.nodes, 1)
      expect(n.args['pattern']).toBe('*.ts')
    })
  })

})

describe('Parser — error cases', () => {
  it('throws ParseError for @call with no name', () => {
    expect(() => parse('@markdownai\n@call /')).toThrow(/macro name/)
  })

  it('throws ParseError for @env with no name', () => {
    expect(() => parse('@markdownai\n@env /')).toThrow(/variable name/)
  })

  it('produces passthrough for unclosed backtick fence', () => {
    const result = parse('@markdownai\n```js\nconst x = 1')
    expect(result.nodes.length).toBeGreaterThan(1)
  })

  it('parses tilde fence content as markdown nodes without error', () => {
    const result = parse('@markdownai\n~~~python\nprint("hello")\n~~~')
    expect(result.isLiveStage).toBe(true)
    expect(result.nodes.length).toBeGreaterThan(0)
  })
})

