// The livestage generated-file metadata block (feat/drift-gates, Part 5):
// six fields a generator writes into every .md it produces, using an
// HTML comment rather than YAML `---` frontmatter, and reusing
// frontmatter-utils.ts's existing key:value/list grammar (parseYamlLines,
// extracted for exactly this kind of reuse during the class 3
// composition session's parse="yaml" work) for the VALUE syntax inside
// it, rather than a new mechanism.
//
// Format decision, made and justified here rather than defaulted: YAML
// `---...---` frontmatter is the conventional answer, and this project
// already has full machinery for it (frontmatter-utils.ts, used by
// @update-frontmatter/@read-frontmatter for every .mdd doc). But GitHub's
// own file-viewer rendering of a plain repository README does not treat
// a leading `---` block as Jekyll front matter, it renders it as literal
// markdown: an empty line, a horizontal rule, an unparsed paragraph of
// "key: value" lines, and a second horizontal rule, right at the top of
// the project's own front page (Jekyll-aware front-matter stripping is a
// GitHub PAGES behavior, not a behavior of GitHub's repository file
// viewer). An HTML comment renders as nothing at all there, invisible to
// a human reader, and is exactly as machine-parseable as a YAML block
// once past the "how do the delimiters look" question, so it is the
// consistent choice for a marker that lives at the top of README.md,
// CLAUDE.md, and (should other generated docs adopt it later) any other
// generated markdown.
import { dirname, resolve } from 'node:path'
import { parseYamlLines } from './frontmatter-utils.js'
import { resolveGlobTargets } from './sources-file-utils.js'
import { hashFileSet } from './content-hash.js'

export interface GeneratedMetadata {
  livestage_source: string
  livestage_updated_at: string
  livestage_version: string
  livestage_content_hash: string
  // A 7th field beyond the brief's own 6-field table, added because the
  // mechanism described (the hook recomputes the declared-inputs hash
  // and compares) cannot work without knowing WHICH files the hash
  // covers: livestage_content_hash alone is just a fingerprint, not
  // reproducible without the input list that produced it. Comma-
  // separated globs, the exact same syntax `build --hash-inputs=` takes,
  // resolved relative to livestage_source's own directory, so a reader
  // (the hook) can recompute the identical hash the generator did.
  // Absent when the generator hashed only the .stage source itself (the
  // default, see build.ts's own BuildOptions.hashInputs doc).
  livestage_hash_inputs?: string
  // The user's own field (see hook/pretooluse.ts), never set by the
  // generator on its own initiative: absent unless a human (or an agent
  // acting on the human's behalf) explicitly wrote it once. A generator
  // re-stamping an already-marked file must carry the existing value
  // forward rather than dropping it; see stampGeneratedMetadata's own
  // `regenerateOnRead` parameter.
  livestage_regenerate_on_read?: 'true' | 'false'
  livestage_degraded: 'true' | 'false'
}

const METADATA_RE = /<!-- livestage:generated\n([\s\S]*?)\n-->\n*/

export interface ExtractedMetadataBlock {
  fullBlock: string
  body: string
}

export function extractGeneratedMetadataBlock(content: string): ExtractedMetadataBlock | null {
  const m = content.match(METADATA_RE)
  if (!m) return null
  return { fullBlock: m[0] ?? '', body: m[1] ?? '' }
}

// Parses the block's own key:value grammar (parseYamlLines: the same
// flat top-level-key subset frontmatter-utils.ts already implements) but
// does NOT validate required fields are present; a caller checking
// "is this file marked as generated at all" should test
// extractGeneratedMetadataBlock's return for null first, this function
// just reads whatever keys the block happens to carry.
export function parseGeneratedMetadata(content: string): Partial<GeneratedMetadata> | null {
  const block = extractGeneratedMetadataBlock(content)
  if (!block) return null
  return parseYamlLines(block.body.split('\n')) as Partial<GeneratedMetadata>
}

// A .md with no metadata block at all is passed through by callers
// entirely untouched; this only ever removes a block that's actually
// there.
export function stripGeneratedMetadataBlock(content: string): string {
  const block = extractGeneratedMetadataBlock(content)
  if (!block) return content
  return content.slice(block.fullBlock.length)
}

export interface StampInput {
  source: string
  version: string
  contentHash: string
  degraded: boolean
  hashInputs?: string
  // undefined: field is omitted entirely (the conservative "absent"
  // default from the hook's own three-way contract). A caller
  // regenerating an already-stamped file is responsible for reading the
  // OLD block's own livestage_regenerate_on_read first (parseGeneratedMetadata
  // on the previous content) and passing it straight through here, so
  // the user's own setting survives regeneration; this function never
  // invents or clears it on its own.
  regenerateOnRead?: boolean
  now?: Date
}

export function stampGeneratedMetadata(renderedContent: string, input: StampInput): string {
  const now = input.now ?? new Date()
  const lines = [
    '<!-- livestage:generated',
    `livestage_source: ${input.source}`,
    `livestage_updated_at: ${now.toISOString()}`,
    `livestage_version: ${input.version}`,
    `livestage_content_hash: ${input.contentHash}`,
  ]
  if (input.hashInputs !== undefined) {
    lines.push(`livestage_hash_inputs: ${input.hashInputs}`)
  }
  if (input.regenerateOnRead !== undefined) {
    lines.push(`livestage_regenerate_on_read: ${input.regenerateOnRead}`)
  }
  lines.push(`livestage_degraded: ${input.degraded}`)
  lines.push('-->')
  return lines.join('\n') + '\n\n' + renderedContent
}

// Recomputes the hash the same way build.ts's stamping step did:
// livestage_hash_inputs (if present) resolved relative to the OUTPUT
// file's own directory (livestage_source itself is a relative path from
// there, matching how the generator recorded it), falling back to
// hashing just the resolved source file when no input glob was
// declared. The hook (Part 5.2) calls this on every read as the cheap
// pre-check: an unchanged hash serves the committed file with no render
// at all.
export function recomputeContentHash(metadata: Partial<GeneratedMetadata>, mdFileDir: string): string | null {
  if (!metadata.livestage_source) return null
  const sourcePath = resolve(mdFileDir, metadata.livestage_source)
  const sourceDir = dirname(sourcePath)
  const files = metadata.livestage_hash_inputs
    ? metadata.livestage_hash_inputs.split(',').flatMap(g => resolveGlobTargets(g.trim(), p => resolve(sourceDir, p)))
    : [sourcePath]
  return hashFileSet(files)
}
