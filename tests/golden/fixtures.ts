import { writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import type { EngineContext } from '../../src/engine/context.js'

// Shared between tests/golden/markdown-out.test.ts (CR-11) and
// tests/golden/deterministic-snapshots.test.ts (feature 35): one fixture
// per registered directive, so "every directive" can't silently mean two
// different things across the two suites as the registry grows. Lives
// outside the `*.test.ts` glob (vitest.config.ts) on purpose: a `.test.ts`
// file's module-level describe()/it() calls re-register as a second full
// test run the moment another spec file imports it, so shared fixtures for
// multiple specs must live in a plain module, not get exported from one of
// the specs themselves.
export const FIXTURES: Record<string, string> = {
  assert: '@assert operator="file-exists" target="package.json" /',
  call: '@import ./defs.md /\n@call foo /',
  code: '@code language="javascript"\nconsole.log(1)\n@code-end',
  check: '@check command="true" /',
  count: '@count ./ match="*.md" /',
  data: '@data r\n  a = 1\n@data-end',
  date: '@date /',
  define: '@define foo\nbody\n@define-end',
  env: '@env HOME fallback="none" /',
  foreach: '@foreach x in @list ./ match="*.md"\nbody\n@foreach-end',
  graph: '@graph target="a.md" /',
  hash: '@hash path="package.json" /',
  if: '@if true\nbody\n@if-end',
  import: '@import ./x.md /',
  'import-graph': '@import-graph src="./" /',
  include: '@include ./x.md /',
  list: '@list ./ match="*.md" /',
  pipe: '@list ./ match="*.md" | @render type="list" /',
  query: '@query "echo hi" /',
  read: '@read ./package.json path="name" /',
  'read-body': '@read-body path="doc.md" /',
  'read-frontmatter': '@read-frontmatter path="doc.md" field="status" /',
  render: '@render type="list" /',
  set: '@set x = "1" /',
  switch: '@switch "a"\n  @case "a"\n    yes\n@switch-end',
  template: '@template ./x.md /',
  test: '@test command="true" /',
  tree: '@tree ./ /',
  'update-frontmatter': '@update-frontmatter path="doc.md" field="status" value="active" /',
}

export function writeFixtureFiles(dirPath: string): void {
  writeFileSync(join(dirPath, 'package.json'), JSON.stringify({ name: 'demo' }))
  writeFileSync(join(dirPath, 'x.md'), '---\nstatus: draft\n---\nShared body.')
  writeFileSync(join(dirPath, 'doc.md'), '---\nstatus: draft\n---\nBody.')
  writeFileSync(join(dirPath, 'a.md'), '---\nid: a\n---\nA')
  writeFileSync(join(dirPath, 'defs.md'), '@define foo\ndefined body\n@define-end\n')
  mkdirSync(join(dirPath, '.livestage'))
  writeFileSync(join(dirPath, '.livestage', 'policy.json'), JSON.stringify({
    filesystem: { write_enabled: true, write_root: 'cwd' },
    code: { languages: ['javascript'], timeout: 30_000, runners: {} },
  }))
}

export function buildSecurity(dirPath: string): EngineContext['security'] {
  return {
    allowShell: true, allowHttp: false, allowDb: false, jailRoot: dirPath,
    shellConfig: { enabled: true, allow_patterns: ['echo *'], deny_patterns: [], allow_network: false, require_confirmation: false, audit_log: false },
    codeConfig: { languages: ['javascript'], timeout: 30_000, runners: {} },
  }
}
