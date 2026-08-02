import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { readFileSync, mkdtempSync, writeFileSync, rmSync, existsSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { tmpdir } from 'node:os'
import {
  shouldHandle, handlePostToolUse, renderViaCli, RENDER_TIMEOUT_MS,
} from '../../../src/hook/pretooluse.js'

const SRC_ROOT = join(dirname(new URL(import.meta.url).pathname), '../../../src')

describe('boundary: hook calls the same code path as cli render', () => {
  it('pretooluse.ts spawns the built cli entry rather than reimplementing render', () => {
    const source = readFileSync(join(SRC_ROOT, 'hook/pretooluse.ts'), 'utf8')
    expect(source).toMatch(/cli\.js/)
    expect(source).toContain("'render'")
    // Guard against a parallel implementation creeping back in: no direct
    // import of the engine's execute() from this file.
    expect(source).not.toMatch(/import\s*\{[^}]*\bexecute\b[^}]*\}\s*from/)
  })
})

describe('shouldHandle', () => {
  it('handles a Read of a .stage file', () => {
    expect(shouldHandle({ tool_name: 'Read', tool_input: { file_path: '/a/b/doc.stage' } })).toBe(true)
  })

  it('never fires on .md, pure extension match, no content sniffing', () => {
    expect(shouldHandle({ tool_name: 'Read', tool_input: { file_path: '/a/b/doc.md' } })).toBe(false)
  })

  it('does not fire on other tools', () => {
    expect(shouldHandle({ tool_name: 'Bash', tool_input: { file_path: '/a/b/doc.stage' } })).toBe(false)
  })

  it('does not fire with no file_path', () => {
    expect(shouldHandle({ tool_name: 'Read', tool_input: {} })).toBe(false)
  })
})

describe('handlePostToolUse', () => {
  let dir: string

  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'hook-pretooluse-')) })
  afterEach(() => { rmSync(dir, { recursive: true, force: true }) })

  it('a .stage read renders identically to cli render on the same file', () => {
    const file = join(dir, 'doc.stage')
    writeFileSync(file, '# Hello\n\nStatic content.\n')
    const cli = renderViaCli(file)
    const hookResult = handlePostToolUse({ tool_name: 'Read', tool_input: { file_path: file } })
    expect(hookResult.hookSpecificOutput?.updatedToolOutput.content).toBe(cli.output)
    expect(hookResult.hookSpecificOutput?.updatedToolOutput.content).toContain('Static content.')
  })

  it('a .md file is never routed to the engine, returns no substitution', () => {
    const file = join(dir, 'doc.md')
    writeFileSync(file, '@query "rm -rf /" /\n')
    const result = handlePostToolUse({ tool_name: 'Read', tool_input: { file_path: file } })
    expect(result).toEqual({})
  })

  it('writes a render cache artifact under .livestage/cache/', () => {
    const file = join(dir, 'doc.stage')
    writeFileSync(file, '# Cached\n')
    handlePostToolUse({ tool_name: 'Read', tool_input: { file_path: file } })
    const cacheDir = join(dir, '.livestage', 'cache')
    expect(existsSync(cacheDir)).toBe(true)
  })

  it('fails open to the raw file content when the file does not exist', () => {
    const result = handlePostToolUse({ tool_name: 'Read', tool_input: { file_path: join(dir, 'missing.stage') } })
    expect(result).toEqual({})
  })

  it('a parse error during render fails open with a degraded banner, not an exception', () => {
    const file = join(dir, 'unclosed.stage')
    writeFileSync(file, '@if env.X == "y"\nno close tag')
    expect(() => handlePostToolUse({ tool_name: 'Read', tool_input: { file_path: file } })).not.toThrow()
    const result = handlePostToolUse({ tool_name: 'Read', tool_input: { file_path: file } })
    const content = result.hookSpecificOutput?.updatedToolOutput.content ?? ''
    expect(content).toContain('degraded render')
  })
})

describe('renderViaCli timeout', () => {
  it('the default timeout is 5000ms per spec', () => {
    expect(RENDER_TIMEOUT_MS).toBe(5000)
  })

  it('a render exceeding a short custom timeout is actually killed (SIGTERM), not just outlasted', () => {
    const dir = mkdtempSync(join(tmpdir(), 'hook-timeout-'))
    try {
      mkdirSync(join(dir, '.livestage'), { recursive: true })
      writeFileSync(join(dir, '.livestage', 'policy.json'), JSON.stringify({
        shell: { enabled: true, allow_patterns: ['sleep *'], deny_patterns: [], allow_network: false, require_confirmation: false, audit_log: false },
      }))
      const file = join(dir, 'slow.stage')
      writeFileSync(file, '@query "sleep 2" /\n')
      const start = Date.now()
      const result = renderViaCli(file, 300)
      const elapsed = Date.now() - start
      expect(result.degraded).toBe(true)
      expect(result.output).toContain('degraded render (render exceeded timeout)')
      // Killed near the timeout, not left to run the full 2s sleep.
      expect(elapsed).toBeLessThan(1500)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
