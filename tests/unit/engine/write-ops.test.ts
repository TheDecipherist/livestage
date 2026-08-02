import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parse } from 'livestage/parser'
import { execute } from '../../../src/engine/engine.js'

/**
 * Wave 3 — v2.0 write directives: @mkdir, @copy, @append-if-missing.
 *
 * All three share the same security gate (filesystem.write_enabled +
 * write_root + allowed_write_paths + immutable rules).
 */

describe('write directives (Wave 3)', () => {
  let projectDir: string
  let skillDir: string

  beforeEach(() => {
    projectDir = mkdtempSync(join(tmpdir(), 'mai-write-proj-'))
    skillDir = mkdtempSync(join(tmpdir(), 'mai-write-skill-'))
  })

  afterEach(() => {
    for (const d of [projectDir, skillDir]) {
      try { rmSync(d, { recursive: true, force: true }) } catch { /* ignore */ }
    }
  })

  function makeFsConfig(extras: Partial<{
    write_enabled: boolean
    write_root: string
    allowed_write_paths: string[]
    allowed_data_paths: string[]
    allowed_source_paths: string[]
  }> = {}) {
    return {
      source_root: 'auto',
      data_root: 'cwd',
      allowed_source_paths: extras.allowed_source_paths ?? [],
      allowed_data_paths: extras.allowed_data_paths ?? [],
      write_enabled: extras.write_enabled ?? true,
      write_root: extras.write_root ?? 'cwd',
      allowed_write_paths: extras.allowed_write_paths ?? [],
      additional_block_paths: [],
      additional_block_patterns: [],
      allow_unmasked_paths: [],
      allow_unmasked_patterns: [],
      user_masking_patterns: [],
    }
  }

  function render(content: string, opts: { cwd: string; filesystemConfig?: ReturnType<typeof makeFsConfig> } = { cwd: '' }) {
    const filePath = join(skillDir, 'doc.md')
    writeFileSync(filePath, content, 'utf8')
    const ast = parse(content, { filePath })
    return execute(ast, {
      filePath,
      ctx: {
        cwd: opts.cwd,
        security: {
          allowShell: false, allowHttp: false, allowDb: false,
          jailRoot: null,
          filesystemConfig: opts.filesystemConfig ?? makeFsConfig(),
        },
      },
    })
  }

  describe('@update-frontmatter /', () => {
    it('replaces an existing frontmatter field value', () => {
      writeFileSync(join(projectDir, 'doc.md'),
        '---\nid: 01-test\nstatus: draft\ntitle: Test\n---\n\nBody content.\n', 'utf8')
      render(
        `@update-frontmatter path="doc.md" field="status" value="complete" /\n`,
        { cwd: projectDir, filesystemConfig: makeFsConfig({ write_enabled: true }) },
      )
      const after = readFileSync(join(projectDir, 'doc.md'), 'utf8')
      expect(after).toContain('status: complete')
      expect(after).not.toContain('status: draft')
      expect(after).toContain('Body content.')
    })

    it('idempotent: no write when value is unchanged', () => {
      const original = '---\nid: 01-test\nstatus: complete\n---\n\nBody.\n'
      writeFileSync(join(projectDir, 'doc.md'), original, 'utf8')
      render(
        `@update-frontmatter path="doc.md" field="status" value="complete" /\n`,
        { cwd: projectDir, filesystemConfig: makeFsConfig({ write_enabled: true }) },
      )
      expect(readFileSync(join(projectDir, 'doc.md'), 'utf8')).toBe(original)
    })

    it('appends the field if absent in the frontmatter', () => {
      writeFileSync(join(projectDir, 'doc.md'),
        '---\nid: 01-test\ntitle: Test\n---\n\nBody.\n', 'utf8')
      render(
        `@update-frontmatter path="doc.md" field="status" value="complete" /\n`,
        { cwd: projectDir, filesystemConfig: makeFsConfig({ write_enabled: true }) },
      )
      const after = readFileSync(join(projectDir, 'doc.md'), 'utf8')
      expect(after).toContain('status: complete')
      expect(after).toContain('id: 01-test')
      expect(after).toContain('title: Test')
    })

    it('refuses to write a file with no frontmatter block', () => {
      writeFileSync(join(projectDir, 'doc.md'), 'No frontmatter here.\n', 'utf8')
      const result = render(
        `@update-frontmatter path="doc.md" field="status" value="complete" /\n`,
        { cwd: projectDir, filesystemConfig: makeFsConfig({ write_enabled: true }) },
      )
      expect(readFileSync(join(projectDir, 'doc.md'), 'utf8')).toBe('No frontmatter here.\n')
      expect(result.warnings.join('\n')).toMatch(/no YAML frontmatter/i)
    })

    it('blocked when target is .env (immutable rule)', () => {
      writeFileSync(join(projectDir, '.env'),
        '---\nSECRET: abc\n---\n', 'utf8')
      const result = render(
        `@update-frontmatter path=".env" field="SECRET" value="xyz" /\n`,
        { cwd: projectDir, filesystemConfig: makeFsConfig({ write_enabled: true }) },
      )
      expect(readFileSync(join(projectDir, '.env'), 'utf8')).toContain('SECRET: abc')
      expect(result.warnings.join('\n')).toMatch(/blocked/i)
    })

    it('blocked when write_enabled is false', () => {
      writeFileSync(join(projectDir, 'doc.md'),
        '---\nstatus: draft\n---\n', 'utf8')
      const result = render(
        `@update-frontmatter path="doc.md" field="status" value="complete" /\n`,
        { cwd: projectDir, filesystemConfig: makeFsConfig({ write_enabled: false }) },
      )
      expect(readFileSync(join(projectDir, 'doc.md'), 'utf8')).toContain('status: draft')
      expect(result.warnings.join('\n')).toMatch(/write is disabled/i)
    })
  })

})
