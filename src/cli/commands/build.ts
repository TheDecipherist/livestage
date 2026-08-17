import { writeFileSync, readFileSync, existsSync } from 'node:fs'
import { resolve, relative, isAbsolute, dirname } from 'node:path'
import { checkFilePath, checkAbsolutePath } from 'livestage/engine'
import { hashFileSet } from '../../engine/content-hash.js'
import { resolveGlobTargets } from '../../engine/sources-file-utils.js'
import { parseGeneratedMetadata, stampGeneratedMetadata } from '../../engine/generated-metadata.js'
import { runRender } from './render.js'
import type { RenderOptions } from './render.js'

// package.json's own version, read once: the same "read live, never
// hand-typed" rule every other version string in this repo follows
// (README.stage's own header line does the equivalent via @read).
function readPackageVersion(): string {
  try {
    const pkgPath = resolve(dirname(new URL(import.meta.url).pathname), '..', '..', '..', 'package.json')
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as { version?: string }
    return pkg.version ?? 'unknown'
  } catch {
    return 'unknown'
  }
}

export interface BuildOptions extends RenderOptions {
  output?: string
  // Part 5 (feat/drift-gates): stamps the livestage:generated HTML
  // comment metadata block (see engine/generated-metadata.ts) into the
  // written output. Opt-in, not the default, so `build -o` keeps its
  // existing plain-output behavior for every other caller (examples:render,
  // ad-hoc scripts) unless a caller explicitly asks to join the
  // generated-file contract.
  stampMetadata?: boolean
  // Glob (relative to the .stage file's own directory, resolved through
  // the same jailed resolver every other path-glob attribute in this
  // codebase uses) naming the files livestage_content_hash covers.
  // Defaults to hashing just the .stage source file itself when omitted,
  // a documented, conservative scope: it will not catch a change to an
  // upstream data source (a .mdd doc, package.json) the document reads
  // live but does not declare here.
  hashInputs?: string
}

export interface BuildResult {
  output: string
  errors: string[]
  warnings: string[]
  exitCode: number
  outputPath?: string
}

export function runBuild(filePath: string, options: BuildOptions = {}): BuildResult {
  const result = runRender(filePath, options)
  let outputPath: string | undefined

  if (options.output && result.exitCode === 0) {
    const baseCwd = resolve(options.cwd ?? process.cwd())
    outputPath = resolve(baseCwd, options.output)
    if (relative(baseCwd, outputPath).startsWith('..')) {
      return { ...result, exitCode: 1, errors: [...result.errors, `@build: output path confined, access denied: ${options.output}`] }
    }
    const pathCheck = isAbsolute(options.output) ? checkAbsolutePath(options.output) : checkFilePath(options.output, baseCwd)
    if (pathCheck.level === 'blocked') {
      return { ...result, exitCode: 1, errors: [...result.errors, `@build: output path blocked, ${pathCheck.reason}: ${options.output}`] }
    }
    try {
      let content = result.output.endsWith('\n') ? result.output : result.output + '\n'
      if (options.stampMetadata) {
        const docDir = dirname(resolve(baseCwd, filePath))
        // Comma-separated: README.stage's own real dependency set spans
        // several unrelated locations (.mdd/docs/*.md, package.json,
        // scripts/test-baseline.json, the worked examples), not one glob.
        const hashFiles = options.hashInputs
          ? options.hashInputs.split(',').flatMap(g => resolveGlobTargets(g.trim(), p => resolve(docDir, p)))
          : [resolve(baseCwd, filePath)]
        const contentHash = hashFileSet(hashFiles)
        // livestage_regenerate_on_read is the user's own field (see
        // hook/pretooluse.ts): read it off whatever is already at
        // outputPath (if anything) and carry it straight through, never
        // set or cleared by this build step on its own initiative.
        let regenerateOnRead: boolean | undefined
        if (existsSync(outputPath)) {
          const existing = parseGeneratedMetadata(readFileSync(outputPath, 'utf8'))
          const raw = existing?.livestage_regenerate_on_read
          if (raw === 'true') regenerateOnRead = true
          else if (raw === 'false') regenerateOnRead = false
        }
        content = stampGeneratedMetadata(content, {
          source: relative(docDir, resolve(baseCwd, filePath)),
          version: readPackageVersion(),
          contentHash,
          degraded: result.warnings.some(w => w.toLowerCase().includes('degraded')),
          ...(options.hashInputs !== undefined ? { hashInputs: options.hashInputs } : {}),
          ...(regenerateOnRead !== undefined ? { regenerateOnRead } : {}),
        })
      }
      writeFileSync(outputPath, content)
    } catch (err) {
      return { ...result, exitCode: 1, errors: [...result.errors, `@build: write failed, ${String(err)}`] }
    }
  }

  return { ...result, ...(outputPath !== undefined ? { outputPath } : {}) }
}
