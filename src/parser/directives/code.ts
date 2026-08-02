import type { ParseModule, ParseContext, DirectiveInput, ASTNode, CodeNode } from '../types.js'
import { ParseError } from '../types.js'

const EXT_TO_LANGUAGE: Record<string, string> = {
  '.js': 'javascript', '.mjs': 'javascript', '.cjs': 'javascript',
  '.py': 'python',
  '.sh': 'bash',
  '.rb': 'ruby',
}

function inferLanguage(src: string | null): string | null {
  if (!src) return null
  const dot = src.lastIndexOf('.')
  if (dot === -1) return null
  return EXT_TO_LANGUAGE[src.slice(dot).toLowerCase()] ?? null
}

const code: ParseModule = {
  name: 'code',
  parse(input: DirectiveInput, ctx: ParseContext): ASTNode {
    const src = input.attrs['src'] ?? null
    const bodyText = input.body.length > 0 ? input.body.join('\n') : null
    if (src && bodyText) {
      throw new ParseError('@code: src= and a block body are mutually exclusive', ctx.line, ctx.filePath)
    }
    if (!src && !bodyText) {
      throw new ParseError('@code requires src= or a block body', ctx.line, ctx.filePath)
    }
    const language = input.attrs['language'] ?? inferLanguage(src)
    if (!language) {
      throw new ParseError('@code requires language= (could not infer one from src=)', ctx.line, ctx.filePath)
    }
    const timeoutRaw = input.attrs['timeout']
    const timeout = timeoutRaw !== undefined ? parseInt(timeoutRaw, 10) : null
    const node: CodeNode = {
      type: 'code',
      line: ctx.line,
      language,
      src,
      body: bodyText,
      label: input.attrs['label'] ?? null,
      timeout: timeout !== null && !isNaN(timeout) ? timeout : null,
      interpolate: input.attrs['interpolate'] === 'true',
      args: { ...input.attrs },
    }
    return node
  },
}

export default code
