import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { execute } from '../../../src/engine/engine.js'
import { parse } from 'livestage/parser'
import type { ParseResult } from 'livestage/parser'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const DOC = ''

function run(source: string, opts?: object) {
  const ast = parse(source)
  return execute(ast, opts as Parameters<typeof execute>[1])
}

function noSecurityCtx() {
  return {
    ctx: {
      security: {
        allowShell: false,
        allowHttp: false,
        allowDb: false,
        jailRoot: null,
      },
    },
  }
}

// ---------------------------------------------------------------------------
// On by default (the one cross-invocation artifact CR-4 permits): a daily
// JSONL file under .livestage/trace/, not stderr, and not opt-in.
// ---------------------------------------------------------------------------

describe('engine tracing - on by default (file sink)', () => {
  let dir: string

  beforeEach(() => {
    delete process.env['LIVESTAGE_TRACE']
    dir = mkdtempSync(join(tmpdir(), 'trace-default-'))
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  it('produces no trace output on stderr when LIVESTAGE_TRACE is not set (file sink, not stderr)', () => {
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
    run(`${DOC}@env FOO fallback="bar" /`, { ctx: { ...noSecurityCtx().ctx, cwd: dir } })
    const traceWrites = stderrSpy.mock.calls.filter(args =>
      typeof args[0] === 'string' && args[0].includes('"status"')
    )
    expect(traceWrites).toHaveLength(0)
    stderrSpy.mockRestore()
  })

  it('writes a dated JSONL file under .livestage/trace/ when unset', async () => {
    run(`${DOC}@env FOO fallback="bar" /`, { ctx: { ...noSecurityCtx().ctx, cwd: dir } })
    await new Promise(r => setTimeout(r, 50))
    const date = new Date().toISOString().slice(0, 10)
    const tracePath = join(dir, '.livestage', 'trace', `${date}.jsonl`)
    expect(existsSync(tracePath)).toBe(true)
    const lines = readFileSync(tracePath, 'utf8').trim().split('\n')
    expect(lines.length).toBeGreaterThan(0)
    expect(() => JSON.parse(lines[0]!)).not.toThrow()
  })

  it('executes without errors with the default tracing on', () => {
    const result = run(`${DOC}@env FOO fallback="bar" /`, { ctx: { ...noSecurityCtx().ctx, cwd: dir } })
    expect(result.errors).toHaveLength(0)
  })

  it('an explicit ctx.traceConfig: null override is not clobbered by the default', async () => {
    const result = run(`${DOC}@env FOO fallback="bar" /`, { ctx: { ...noSecurityCtx().ctx, cwd: dir, traceConfig: null } })
    expect(result.errors).toHaveLength(0)
    await new Promise(r => setTimeout(r, 50))
    const date = new Date().toISOString().slice(0, 10)
    expect(existsSync(join(dir, '.livestage', 'trace', `${date}.jsonl`))).toBe(false)
  })

  it('LIVESTAGE_TRACE=off disables tracing entirely', async () => {
    process.env['LIVESTAGE_TRACE'] = 'off'
    run(`${DOC}@env FOO fallback="bar" /`, { ctx: { ...noSecurityCtx().ctx, cwd: dir } })
    await new Promise(r => setTimeout(r, 50))
    const date = new Date().toISOString().slice(0, 10)
    expect(existsSync(join(dir, '.livestage', 'trace', `${date}.jsonl`))).toBe(false)
    delete process.env['LIVESTAGE_TRACE']
  })
})

// ---------------------------------------------------------------------------
// Render-level summary record: one per execute() call, distinct from the
// per-directive spans.
// ---------------------------------------------------------------------------

describe('engine tracing - render summary record', () => {
  beforeEach(() => {
    process.env['LIVESTAGE_TRACE'] = 'stderr'
  })

  afterEach(() => {
    delete process.env['LIVESTAGE_TRACE']
    vi.restoreAllMocks()
  })

  it('emits exactly one render record matching the doc schema, after the directive spans', () => {
    const writes: string[] = []
    vi.spyOn(process.stderr, 'write').mockImplementation((chunk) => {
      if (typeof chunk === 'string') writes.push(chunk)
      return true
    })
    run(`${DOC}@env A fallback="1" /\n@env B fallback="2" /`, noSecurityCtx())
    const records = writes.flatMap(w => w.split('\n').filter(Boolean)).map(l => JSON.parse(l))
    const renderRecords = records.filter((r: Record<string, unknown>) => r['t'] === 'render')
    expect(renderRecords).toHaveLength(1)
    const rr = renderRecords[0] as Record<string, unknown>
    expect(typeof rr['render_id']).toBe('string')
    expect(typeof rr['doc']).toBe('string')
    expect(typeof rr['ms']).toBe('number')
    expect(rr['directives']).toBe(2)
    expect(rr['degraded']).toBe(false)
    expect(rr['exit']).toBe(0)
    // Comes after every directive span, not interleaved or first.
    expect(records[records.length - 1]).toBe(rr)
  })

  it('exit is 1 when the render produced errors (blocked absolute @include path)', () => {
    const writes: string[] = []
    vi.spyOn(process.stderr, 'write').mockImplementation((chunk) => {
      if (typeof chunk === 'string') writes.push(chunk)
      return true
    })
    // @include's absolute-path guard rejects at parse time (a ParseError,
    // not something execute() surfaces in result.errors), so this hand-
    // builds the AST directly, bypassing the parser, to reach an
    // execute()-time failure: the source-jail check in executeInclude
    // throws a FatalError for a path outside the jail.
    const ast: ParseResult = {
      isLiveStage: true,
      version: null,
      nodes: [
        { type: 'passthrough', line: 1, raw: '' },
        { type: 'include', line: 2, path: '../../../../../etc/passwd', condition: null, local: false, cache: null },
      ],
    }
    const result = execute(ast, noSecurityCtx())
    expect(result.errors.length).toBeGreaterThan(0)
    const records = writes.flatMap(w => w.split('\n').filter(Boolean)).map(l => JSON.parse(l))
    const rr = records.find((r: Record<string, unknown>) => r['t'] === 'render') as Record<string, unknown>
    expect(rr).toBeDefined()
    expect(rr['exit']).toBe(1)
  })
})

// ---------------------------------------------------------------------------
// Stderr sink
// ---------------------------------------------------------------------------

describe('engine tracing — stderr sink', () => {
  beforeEach(() => {
    process.env['LIVESTAGE_TRACE'] = 'stderr'
  })

  afterEach(() => {
    delete process.env['LIVESTAGE_TRACE']
    vi.restoreAllMocks()
  })

  it('emits a start span to stderr when a directive executes', () => {
    const writes: string[] = []
    vi.spyOn(process.stderr, 'write').mockImplementation((chunk) => {
      if (typeof chunk === 'string') writes.push(chunk)
      return true
    })
    run(`${DOC}@env FOO fallback="bar" /`, noSecurityCtx())
    const spans = writes.flatMap(w => w.split('\n').filter(Boolean)).map(l => JSON.parse(l))
    const startSpan = spans.find((s: Record<string, unknown>) => s['status'] === 'start' && s['directive'] === 'env')
    expect(startSpan).toBeDefined()
  })

  it('emits matching start and end spans with the same id', () => {
    const writes: string[] = []
    vi.spyOn(process.stderr, 'write').mockImplementation((chunk) => {
      if (typeof chunk === 'string') writes.push(chunk)
      return true
    })
    run(`${DOC}@env FOO fallback="bar" /`, noSecurityCtx())
    const spans = writes.flatMap(w => w.split('\n').filter(Boolean)).map(l => JSON.parse(l))
    const startSpan = spans.find((s: Record<string, unknown>) => s['status'] === 'start' && s['directive'] === 'env')
    const endSpan = spans.find((s: Record<string, unknown>) => s['status'] === 'end' && s['directive'] === 'env')
    expect(startSpan).toBeDefined()
    expect(endSpan).toBeDefined()
    expect(startSpan!['id']).toBe(endSpan!['id'])
  })

  it('end span includes duration and outputSize', () => {
    const writes: string[] = []
    vi.spyOn(process.stderr, 'write').mockImplementation((chunk) => {
      if (typeof chunk === 'string') writes.push(chunk)
      return true
    })
    run(`${DOC}@env FOO fallback="bar" /`, noSecurityCtx())
    const spans = writes.flatMap(w => w.split('\n').filter(Boolean)).map(l => JSON.parse(l))
    const endSpan = spans.find((s: Record<string, unknown>) => s['status'] === 'end' && s['directive'] === 'env')
    expect(endSpan).toBeDefined()
    expect(typeof endSpan!['duration']).toBe('number')
    expect(typeof endSpan!['outputSize']).toBe('number')
  })

  it('span includes document, line, runId, and timestamp fields', () => {
    const writes: string[] = []
    vi.spyOn(process.stderr, 'write').mockImplementation((chunk) => {
      if (typeof chunk === 'string') writes.push(chunk)
      return true
    })
    run(`${DOC}@env FOO fallback="bar" /`, noSecurityCtx())
    const spans = writes.flatMap(w => w.split('\n').filter(Boolean)).map(l => JSON.parse(l))
    const span = spans.find((s: Record<string, unknown>) => s['directive'] === 'env')
    expect(span).toBeDefined()
    expect(typeof span!['runId']).toBe('string')
    expect(span!['runId']).not.toBe('')
    expect(typeof span!['timestamp']).toBe('number')
    expect(typeof span!['line']).toBe('number')
  })

  it('all spans in one execute() call share the same runId', () => {
    const writes: string[] = []
    vi.spyOn(process.stderr, 'write').mockImplementation((chunk) => {
      if (typeof chunk === 'string') writes.push(chunk)
      return true
    })
    run(`${DOC}@env A fallback="1" /\n@env B fallback="2" /`, noSecurityCtx())
    const records = writes.flatMap(w => w.split('\n').filter(Boolean)).map(l => JSON.parse(l))
    const spans = records.filter((r: Record<string, unknown>) => r['t'] === 'directive')
    const runIds = [...new Set(spans.map((s: Record<string, unknown>) => s['runId']))]
    expect(runIds).toHaveLength(1)
    // The render-level summary record uses render_id (the doc's own schema
    // field name), not runId, but carries the same value.
    const renderRecord = records.find((r: Record<string, unknown>) => r['t'] === 'render')
    expect(renderRecord?.['render_id']).toBe(runIds[0])
  })

  it('emits valid JSON-Lines (each line is parseable)', () => {
    const writes: string[] = []
    vi.spyOn(process.stderr, 'write').mockImplementation((chunk) => {
      if (typeof chunk === 'string') writes.push(chunk)
      return true
    })
    run(`${DOC}@env FOO fallback="bar" /`, noSecurityCtx())
    const lines = writes.join('').split('\n').filter(Boolean)
    for (const line of lines) {
      expect(() => JSON.parse(line)).not.toThrow()
    }
  })
})

// ---------------------------------------------------------------------------
// LIVESTAGE_TRACE alternate values
// ---------------------------------------------------------------------------

describe('engine tracing — stderr aliases', () => {
  afterEach(() => {
    delete process.env['LIVESTAGE_TRACE']
    vi.restoreAllMocks()
  })

  it('LIVESTAGE_TRACE=1 activates stderr sink', () => {
    process.env['LIVESTAGE_TRACE'] = '1'
    const writes: string[] = []
    vi.spyOn(process.stderr, 'write').mockImplementation((chunk) => {
      if (typeof chunk === 'string') writes.push(chunk)
      return true
    })
    run(`${DOC}@env FOO fallback="bar" /`, noSecurityCtx())
    const spans = writes.flatMap(w => w.split('\n').filter(Boolean))
    expect(spans.length).toBeGreaterThan(0)
  })

  it('LIVESTAGE_TRACE=true activates stderr sink', () => {
    process.env['LIVESTAGE_TRACE'] = 'true'
    const writes: string[] = []
    vi.spyOn(process.stderr, 'write').mockImplementation((chunk) => {
      if (typeof chunk === 'string') writes.push(chunk)
      return true
    })
    run(`${DOC}@env FOO fallback="bar" /`, noSecurityCtx())
    const spans = writes.flatMap(w => w.split('\n').filter(Boolean))
    expect(spans.length).toBeGreaterThan(0)
  })
})

// ---------------------------------------------------------------------------
// Invalid sink value
// ---------------------------------------------------------------------------

describe('engine tracing — invalid LIVESTAGE_TRACE value', () => {
  afterEach(() => {
    delete process.env['LIVESTAGE_TRACE']
    vi.restoreAllMocks()
  })

  it('emits a warning to stderr and disables tracing when sink is unrecognized', () => {
    process.env['LIVESTAGE_TRACE'] = 'ftp://bad-sink'
    const writes: string[] = []
    vi.spyOn(process.stderr, 'write').mockImplementation((chunk) => {
      if (typeof chunk === 'string') writes.push(chunk)
      return true
    })
    const result = run(`${DOC}@env FOO fallback="bar" /`, noSecurityCtx())
    expect(result.errors).toHaveLength(0)
    const combined = writes.join('')
    expect(combined).toMatch(/LIVESTAGE_TRACE|trace|warning/i)
    const spanLines = writes.flatMap(w => w.split('\n').filter(Boolean)).filter(l => {
      try { const p = JSON.parse(l); return 'status' in p && ('directive' in p || 'ast' in p) } catch { return false }
    })
    expect(spanLines).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// File sink
// ---------------------------------------------------------------------------

describe('engine tracing — file sink', () => {
  afterEach(() => {
    delete process.env['LIVESTAGE_TRACE']
    vi.restoreAllMocks()
  })

  it('writes JSON-Lines span data to the configured file path', async () => {
    const { readFileSync, unlinkSync, existsSync } = await import('node:fs')
    const tracePath = `/tmp/livestage-trace-test-${Date.now()}.jsonl`
    process.env['LIVESTAGE_TRACE'] = `file:${tracePath}`
    run(`${DOC}@env FOO fallback="bar" /`, noSecurityCtx())
    await new Promise(r => setTimeout(r, 80))
    expect(existsSync(tracePath)).toBe(true)
    const content = readFileSync(tracePath, 'utf8')
    const lines = content.split('\n').filter(Boolean)
    expect(lines.length).toBeGreaterThan(0)
    for (const line of lines) {
      expect(() => JSON.parse(line)).not.toThrow()
    }
    unlinkSync(tracePath)
  })
})

// ---------------------------------------------------------------------------
// Args masking
// ---------------------------------------------------------------------------

describe('engine tracing — args masking', () => {
  afterEach(() => {
    delete process.env['LIVESTAGE_TRACE']
    vi.restoreAllMocks()
  })

  it('masks secret-like values in directive args before serialization', () => {
    const writes: string[] = []
    vi.spyOn(process.stderr, 'write').mockImplementation((chunk) => {
      if (typeof chunk === 'string') writes.push(chunk)
      return true
    })
    process.env['LIVESTAGE_TRACE'] = 'stderr'
    process.env['DB_PASSWORD'] = 'super-secret-password=abc123'
    run(`${DOC}@env DB_PASSWORD fallback="password=should-be-masked" /`, noSecurityCtx())
    const combined = writes.join('')
    expect(combined).not.toContain('super-secret-password')
    delete process.env['DB_PASSWORD']
  })
})

// ---------------------------------------------------------------------------
// Error spans
// ---------------------------------------------------------------------------

describe('engine tracing — error spans', () => {
  afterEach(() => {
    delete process.env['LIVESTAGE_TRACE']
    vi.restoreAllMocks()
  })

  it('emits an error span when a directive throws', () => {
    const writes: string[] = []
    vi.spyOn(process.stderr, 'write').mockImplementation((chunk) => {
      if (typeof chunk === 'string') writes.push(chunk)
      return true
    })
    process.env['LIVESTAGE_TRACE'] = 'stderr'
    // A pipe with a shell step throws when allowShell=false — the 'pipe' node propagates the error
    run(`${DOC}@list ./ | awk '{print}' /`, {
      ctx: {
        security: { allowShell: false, allowHttp: false, allowDb: false, jailRoot: null },
      },
    })
    const spans = writes.flatMap(w => w.split('\n').filter(Boolean)).map(l => JSON.parse(l))
    const errSpan = spans.find((s: Record<string, unknown>) => s['status'] === 'error')
    expect(errSpan).toBeDefined()
    expect(typeof errSpan!['error']).toBe('string')
    expect(errSpan!['error']).not.toBe('')
  })
})

// ---------------------------------------------------------------------------
// Span fields — phase and callstack
// ---------------------------------------------------------------------------

describe('engine tracing — phase and callstack in spans', () => {
  afterEach(() => {
    delete process.env['LIVESTAGE_TRACE']
    vi.restoreAllMocks()
  })

  it('span callstack is empty at top-level directive', () => {
    const writes: string[] = []
    vi.spyOn(process.stderr, 'write').mockImplementation((chunk) => {
      if (typeof chunk === 'string') writes.push(chunk)
      return true
    })
    process.env['LIVESTAGE_TRACE'] = 'stderr'
    run(`${DOC}@env FOO fallback="bar" /`, noSecurityCtx())
    const spans = writes.flatMap(w => w.split('\n').filter(Boolean)).map(l => JSON.parse(l))
    const startSpan = spans.find((s: Record<string, unknown>) => s['status'] === 'start' && s['directive'] === 'env')
    expect(startSpan!['callstack']).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// Multiple directive types traced
// ---------------------------------------------------------------------------

describe('engine tracing — multiple directive types', () => {
  afterEach(() => {
    delete process.env['LIVESTAGE_TRACE']
    vi.restoreAllMocks()
  })

  it('traces markdown nodes and env directives', () => {
    const writes: string[] = []
    vi.spyOn(process.stderr, 'write').mockImplementation((chunk) => {
      if (typeof chunk === 'string') writes.push(chunk)
      return true
    })
    process.env['LIVESTAGE_TRACE'] = 'stderr'
    run(`${DOC}@env A fallback="1" /\n@env B fallback="2" /`, noSecurityCtx())
    const spans = writes.flatMap(w => w.split('\n').filter(Boolean)).map(l => JSON.parse(l))
    const envSpans = spans.filter((s: Record<string, unknown>) => s['directive'] === 'env' && s['status'] === 'start')
    expect(envSpans.length).toBeGreaterThanOrEqual(2)
  })
})
