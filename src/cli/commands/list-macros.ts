import { readFileSync } from 'node:fs'
import { resolve, isAbsolute } from 'node:path'
import { parse } from 'livestage/parser'
import type { DefineNode } from 'livestage/parser'
import { checkFilePath, checkAbsolutePath } from 'livestage/engine'

export interface MacroEntry {
  name: string
  params: string[]
  line: number
  local: boolean
}

export interface ListMacrosResult {
  macros: MacroEntry[]
  errors: string[]
  exitCode: number
}

export function runListMacros(filePath: string, options: { cwd?: string } = {}): ListMacrosResult {
  const cwd = options.cwd ?? process.cwd()
  const check = isAbsolute(filePath) ? checkAbsolutePath(filePath) : checkFilePath(filePath, cwd)
  if (check.level === 'blocked') return { macros: [], errors: [`Path blocked: ${check.reason}`], exitCode: 1 }
  const resolved = resolve(cwd, filePath)
  let source: string
  try { source = readFileSync(resolved, 'utf8') } catch {
    return { macros: [], errors: [`Cannot read file: ${filePath}`], exitCode: 1 }
  }

  const ast = parse(source, { filePath: resolved })
  if (!ast.isLiveStage) return { macros: [], errors: ['Not a LiveStage document'], exitCode: 1 }

  const macros: MacroEntry[] = []
  for (const node of ast.nodes) {
    if (node.type !== 'define') continue
    const def = node as DefineNode
    macros.push({ name: def.name, params: def.params, line: def.line, local: def.local })
  }
  return { macros, errors: [], exitCode: 0 }
}
