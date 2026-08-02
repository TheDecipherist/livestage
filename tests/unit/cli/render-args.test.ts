import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { runRender } from '../../../src/cli/commands/render.js'

// Wave 2, feature 23 (Arguments / F-ARGS): --args/--var had no CLI wiring
// at all before this wave (src/engine/args.ts did not exist). Covers the
// full path from CLI options through to {{ args }}/{{ vars.k }} and the
// LIVESTAGE_ARGS/LIVESTAGE_VAR_* env mirror.
describe('runRender: --args / --var (F-ARGS)', () => {
  let dir: string

  beforeAll(() => { dir = mkdtempSync(join(tmpdir(), 'ls-render-args-')) })
  afterAll(() => { rmSync(dir, { recursive: true, force: true }) })

  function write(name: string, content: string): string {
    const p = join(dir, name)
    writeFileSync(p, content)
    return p
  }

  it('--args exposes {{ args }} and tokenized {{ arg0 }}', () => {
    const file = write('a.stage', '{{ args }}|{{ arg0 }}')
    const result = runRender(file, { args: 'sync now' })
    expect(result.output).toBe('sync now|sync')
  })

  it('--var exposes {{ vars.k }}', () => {
    const file = write('b.stage', '{{ vars.k }}')
    const result = runRender(file, { varFlags: ['k=hello'] })
    expect(result.output).toBe('hello')
  })

  it('a passive render with no args/vars at all renders without throwing (hook parity)', () => {
    const file = write('c.stage', 'args=<<{{ args }}>> k=<<{{ vars.k }}>>')
    const result = runRender(file, {})
    expect(result.errors).toHaveLength(0)
    expect(result.output).toBe('args=<<>> k=<<>>')
  })

  it('LIVESTAGE_ARGS and LIVESTAGE_VAR_<K> are readable via @env, mirroring the template bindings', () => {
    const file = write('d.stage', '@env LIVESTAGE_ARGS /\n@env LIVESTAGE_VAR_K /\n')
    const result = runRender(file, { args: 'sync', varFlags: ['K=hello'] })
    expect(result.output.trim().split('\n')).toEqual(['sync', 'hello'])
  })

  it('--skill-args and --args populate the same {{ args }} binding (F-ARGS reuses the existing skill-context machinery)', () => {
    const file = write('e.stage', '{{ args }}')
    expect(runRender(file, { skillArgs: 'via-skill-args' }).output).toBe('via-skill-args')
    expect(runRender(file, { args: 'via-args' }).output).toBe('via-args')
  })
})
