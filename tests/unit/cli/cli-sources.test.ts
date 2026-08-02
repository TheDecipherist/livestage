import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { writeFileSync, mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { runRender } from '../../../src/cli/commands/render.js'

const TMP = join(tmpdir(), 'livestage-cli-sources-test')

beforeAll(() => { mkdirSync(TMP, { recursive: true }) })
afterAll(() => { rmSync(TMP, { recursive: true, force: true }) })

function write(name: string, content: string): string {
  const p = join(TMP, name)
  writeFileSync(p, content)
  return p
}

describe('@read source directive /', () => {
  it('@read JSON with dot-notation path returns single value /', () => {
    const jsonFile = join(TMP, 'config.json')
    writeFileSync(jsonFile, JSON.stringify({ app: { name: 'LiveStage' } }))
    const file = write('read-json.md', `\n@read ./config.json path="app.name" /\n`)
    const result = runRender(file)
    expect(result.exitCode).toBe(0)
    expect(result.output).toContain('LiveStage')
  })

  it('@read JSON with array index path /', () => {
    const jsonFile = join(TMP, 'servers.json')
    writeFileSync(jsonFile, JSON.stringify({ servers: [{ host: 'prod.example.com' }, { host: 'dev.example.com' }] }))
    const file = write('read-json-idx.md', `\n@read ./servers.json path="servers[0].host" /\n`)
    const result = runRender(file)
    expect(result.output).toContain('prod.example.com')
  })

  it('@read .env blocked by FILESYSTEM_ALWAYS_BLOCK_PATTERNS /', () => {
    const envFile = join(TMP, 'sample.env')
    writeFileSync(envFile, 'APP_NAME=LiveStage\nAPP_VERSION=1.0\n')
    const file = write('read-env.md', `\n@read ./sample.env key="APP_NAME" /\n`)
    const result = runRender(file)
    expect(result.output.trim()).toBe('')
  })

  it('@read CSV with column= extracts single column /', () => {
    const csvFile = join(TMP, 'products.csv')
    writeFileSync(csvFile, 'name,price\nApple,1.5\nBanana,0.8\n')
    const file = write('read-csv.md', `\n@read ./products.csv column="name" | @render type="list" /\n`)
    const result = runRender(file)
    expect(result.output).toContain('Apple')
    expect(result.output).toContain('Banana')
    expect(result.output).not.toContain('price')
  })

  it('@read column= against a JSON file warns instead of silently ignoring the option /', () => {
    const jsonFile = join(TMP, 'mismatch.json')
    writeFileSync(jsonFile, JSON.stringify({ name: 'demo' }))
    const file = write('read-mismatch-json.md', `\n@read ./mismatch.json column="foo" /\n`)
    const result = runRender(file)
    expect(result.warnings.some(w => w.includes('column=') && w.includes('JSON'))).toBe(true)
  })

  it('@read path= against a CSV file warns instead of silently ignoring the option /', () => {
    const csvFile = join(TMP, 'mismatch.csv')
    writeFileSync(csvFile, 'name,price\nApple,1.5\n')
    const file = write('read-mismatch-csv.md', `\n@read ./mismatch.csv path="name" /\n`)
    const result = runRender(file)
    expect(result.warnings.some(w => w.includes('path=') && w.includes('CSV'))).toBe(true)
  })

  it('@read column= against a plain text file warns and falls back to a raw read /', () => {
    const txtFile = join(TMP, 'mismatch.txt')
    writeFileSync(txtFile, 'plain text\n')
    const file = write('read-mismatch-txt.md', `\n@read ./mismatch.txt column="foo" /\n`)
    const result = runRender(file)
    expect(result.warnings.some(w => w.includes('column=') && w.includes('neither'))).toBe(true)
    expect(result.output).toContain('plain text')
  })

  it('@read with no structured option against a plain text file stays silent /', () => {
    const txtFile = join(TMP, 'clean.txt')
    writeFileSync(txtFile, 'plain text\n')
    const file = write('read-clean-txt.md', `\n@read ./clean.txt /\n`)
    const result = runRender(file)
    expect(result.warnings).toHaveLength(0)
  })
})

describe('@tree, @date, @count utility directives /', () => {
  it('@tree renders ASCII directory tree /', () => {
    const dir = join(TMP, 'tree-test')
    mkdirSync(join(dir, 'sub'), { recursive: true })
    writeFileSync(join(dir, 'root.ts'), '')
    writeFileSync(join(dir, 'sub', 'child.ts'), '')
    const file = write('tree.md', `\n@tree ./tree-test /\n`)
    const result = runRender(file)
    expect(result.exitCode).toBe(0)
    expect(result.output).toContain('root.ts')
    expect(result.output).toContain('sub')
  })

  it('@date returns current date ISO string /', () => {
    const file = write('date.md', '\n@date /\n')
    const result = runRender(file)
    expect(result.exitCode).toBe(0)
    expect(result.output).toMatch(/\d{4}-\d{2}-\d{2}/)
  })

  it('@date format="YYYY" returns 4-digit year /', () => {
    const file = write('date-fmt.md', '\n@date format="YYYY" /\n')
    const result = runRender(file)
    expect(result.output.trim()).toMatch(/^\d{4}$/)
  })

  it('@count counts files in directory /', () => {
    const dir = join(TMP, 'count-test')
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'a.ts'), '')
    writeFileSync(join(dir, 'b.ts'), '')
    writeFileSync(join(dir, 'c.js'), '')
    const file = write('count.md', `\n@count ./count-test match="*.ts" /\n`)
    const result = runRender(file)
    expect(result.exitCode).toBe(0)
    expect(result.output.trim()).toBe('2')
  })

  it('@date type="created" throws parse error /', () => {
    const file = write('date-created.md', '\n@date type="created" /\n')
    const result = runRender(file)
    expect(result.exitCode).toBe(1)
    expect(result.errors.some(e => e.toLowerCase().includes('created'))).toBe(true)
  })
})

describe('@query shell directive /', () => {
  it('@query stripped silently when security.allowShell is false /', () => {
    const allJailed = { securityConfig: { allowShell: false, allowHttp: false, allowDb: false, jailRoot: TMP } }
    const file = write('query-stripped.md', '\n@query "echo hello" /\n\n# Doc\n')
    const result = runRender(file, allJailed)
    expect(result.exitCode).toBe(0)
    expect(result.output.trim()).toBe('# Doc')
    expect(result.warnings).toHaveLength(0)
  })
})

describe('@graph directive', () => {
  it('@graph renders a tree of native depends_on edges from frontmatter /', () => {
    const dir = join(TMP, 'graph-test')
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'a.md'), '---\nid: a\n---\n# A\n')
    writeFileSync(join(dir, 'b.md'), '---\nid: b\ndepends_on: a\n---\n# B\n')
    const file = write('graph.md', `\n@graph target="./graph-test/*.md" /\n`)
    const result = runRender(file)
    expect(result.exitCode).toBe(0)
    expect(result.output).toContain('- a')
    expect(result.output).toContain('- b')
  })

  it('@graph format="mermaid" renders a fenced mermaid block /', () => {
    const dir = join(TMP, 'graph-mermaid')
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'a.md'), '---\nid: a\n---\n# A\n')
    writeFileSync(join(dir, 'b.md'), '---\nid: b\ndepends_on: a\n---\n# B\n')
    const file = write('graph-mermaid.md', `\n@graph target="./graph-mermaid/*.md" format="mermaid" /\n`)
    const result = runRender(file)
    expect(result.exitCode).toBe(0)
    expect(result.output).toContain('```mermaid')
    expect(result.output).toContain('b --> a')
  })
})

describe('@env resolution and @import fallback registration /', () => {
  it('@env inside @import registers fallback — subsequent @env in main doc resolves it /', () => {
    write('shared-env.md', '\n@env MDD_TEST_APP fallback="MyApp" /\n')
    const main = write('main-env.md', '\n@import ./shared-env.md /\n\n@env MDD_TEST_APP /\n')
    const result = runRender(main)
    expect(result.exitCode).toBe(0)
    expect(result.output).toContain('MyApp')
  })

  it('@env without fallback returns empty string when var not set /', () => {
    const file = write('env-empty.md', '\n@env DEFINITELY_NOT_SET_MDD_12345 /\n')
    const result = runRender(file)
    expect(result.exitCode).toBe(0)
    expect(result.output.trim()).toBe('')
  })

  it('@env directive-level fallback wins when process.env is unset /', () => {
    const file = write('env-directive-fallback.md', '\n@env UNSET_MDD_VAR_9999 fallback="directive-default" /\n')
    const result = runRender(file)
    expect(result.exitCode).toBe(0)
    expect(result.output).toContain('directive-default')
  })
})
