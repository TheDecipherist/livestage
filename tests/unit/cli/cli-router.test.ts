import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { writeFileSync, mkdtempSync, rmSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'

// End-to-end CLI Router tests: spawn the real built binary rather than
// calling library functions directly, since this is what actually exercises
// the router (argument parsing, namespace dispatch, exit-code plumbing) as
// opposed to the individual command implementations, which have their own
// unit tests elsewhere.
const CLI_ENTRY = join(dirname(new URL(import.meta.url).pathname), '../../../dist/cli/cli.js')

function runCli(args: string[], cwd?: string): { stdout: string; stderr: string; status: number | null } {
  const result = spawnSync(process.execPath, [CLI_ENTRY, ...args], { encoding: 'utf8', cwd })
  return { stdout: result.stdout, stderr: result.stderr, status: result.status }
}

describe('CLI Router: namespaced verbs dispatch correctly', () => {
  let dir: string

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'cli-router-'))
    writeFileSync(join(dir, 'doc.stage'), '@define greet\nHello!\n@define-end\n\n@call greet /\n')
  })

  afterAll(() => { rmSync(dir, { recursive: true, force: true }) })

  it('parser ast <file> outputs the AST as JSON, exit 0', () => {
    const r = runCli(['parser', 'ast', 'doc.stage'], dir)
    expect(r.status).toBe(0)
    expect(() => JSON.parse(r.stdout)).not.toThrow()
  })

  it('parser directives lists the registry, exit 0', () => {
    const r = runCli(['parser', 'directives'], dir)
    expect(r.status).toBe(0)
    expect(r.stdout).toContain('@list')
    expect(r.stdout).toContain('@if')
  })

  it('parser macros <file> lists defined macros, exit 0', () => {
    const r = runCli(['parser', 'macros', 'doc.stage'], dir)
    expect(r.status).toBe(0)
    expect(r.stdout).toContain('@define greet')
  })

  it('parser imports <file> lists @include/@import deps, exit 0', () => {
    const r = runCli(['parser', 'imports', 'doc.stage'], dir)
    expect(r.status).toBe(0)
  })

  it('engine trace routes to the trace reader (exit 1, no trace yet)', () => {
    const r = runCli(['engine', 'trace'], dir)
    expect(r.status).toBe(1)
    expect(r.stderr).toContain('ERROR')
  })

  it('security show routes to the security namespace, exit 0', () => {
    const r = runCli(['security', 'show'], dir)
    expect(r.status).toBe(0)
  })

  it('an unknown top-level verb exits nonzero (usage error)', () => {
    const r = runCli(['not-a-real-command'])
    expect(r.status).not.toBe(0)
  })
})

describe('CLI Router: exit-code contract for flat verbs', () => {
  let dir: string

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'cli-exitcodes-'))
    writeFileSync(join(dir, 'good.stage'), '# Fine\n')
    writeFileSync(join(dir, 'bad.stage'), '@call undefined_macro_xyz /\n')
  })

  afterAll(() => { rmSync(dir, { recursive: true, force: true }) })

  it('render: exit 0 on success', () => {
    const r = runCli(['render', 'good.stage'], dir)
    expect(r.status).toBe(0)
  })

  it('render: exit 1 for a missing file', () => {
    const r = runCli(['render', 'nonexistent.stage'], dir)
    expect(r.status).toBe(1)
  })

  it('validate: exit 0 for a valid document', () => {
    const r = runCli(['validate', 'good.stage'], dir)
    expect(r.status).toBe(0)
  })

  it('validate: exit 1 for an invalid document (undefined macro)', () => {
    const r = runCli(['validate', 'bad.stage'], dir)
    expect(r.status).toBe(1)
  })

  it('eval: prints a value on success', () => {
    const r = runCli(['eval', '1 + 1'])
    expect(r.stdout.trim()).toBe('2')
  })
})
