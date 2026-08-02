import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { parse } from 'livestage/parser'
import { execute } from 'livestage/engine'
import type { AssertResult } from 'livestage/engine'
import { buildSecurityConfig, buildSkillContext } from './render.js'
import type { SkillContextOptions } from './render.js'
import { runValidate } from './validate.js'
import { expandFileGlob } from '../glob-expand.js'
import { argsEnvMirror } from '../../engine/args.js'

export interface AssertOptions extends SkillContextOptions {
  cwd?: string
  silent?: boolean
}

export interface AssertFileResult {
  file: string
  results: AssertResult[]
  errors: string[]
}

export interface AssertRunResult {
  files: AssertFileResult[]
  exitCode: number  // 0 all pass, 1 any fail, 2 document invalid
}

// "Document invalid" (exit 2) means the same thing `validate` considers
// invalid: not just a parse error, but any of validate's semantic checks
// (undefined @call macro, missing @include target, inert @assert doc,
// args with no fallback, ...). Reuses runValidate rather than duplicating
// those checks here.
function assertOneFile(filePath: string, options: AssertOptions): AssertFileResult {
  const cwd = options.cwd ?? process.cwd()
  const resolved = resolve(cwd, filePath)
  const validated = runValidate(filePath, options.cwd !== undefined ? { cwd: options.cwd } : {})
  if (validated.exitCode !== 0) {
    return { file: filePath, results: [], errors: validated.errors }
  }
  const source = readFileSync(resolved, 'utf8')
  const ast = parse(source, { filePath: resolved })
  const security = buildSecurityConfig(options.cwd !== undefined ? { cwd: options.cwd } : {}, resolved)
  const results: AssertResult[] = []
  const skillContext = buildSkillContext(options)
  const envFiles: Record<string, string> = {}
  if (skillContext) {
    Object.assign(envFiles, argsEnvMirror({ args: skillContext.args, argsList: skillContext.argsList, vars: skillContext.vars }))
  }
  execute(ast, {
    filePath: resolved,
    ctx: {
      cwd, assertResults: results, security, envFiles,
      ...(skillContext ? { skillContext } : {}),
    },
  })
  return { file: filePath, results, errors: [] }
}

export function runAssert(pattern: string, options: AssertOptions = {}): AssertRunResult {
  const cwd = options.cwd ?? process.cwd()
  const files = expandFileGlob(pattern, cwd)
  if (files.length === 0) {
    return { files: [{ file: pattern, results: [], errors: [`No files matched: ${pattern}`] }], exitCode: 2 }
  }
  const fileResults = files.map(f => assertOneFile(f, options))
  const anyInvalid = fileResults.some(f => f.errors.length > 0)
  if (anyInvalid) return { files: fileResults, exitCode: 2 }
  const allResults = fileResults.flatMap(f => f.results)
  const anyFailed = allResults.some(r => !r.passed)
  return { files: fileResults, exitCode: anyFailed ? 1 : 0 }
}
