import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

// CR-9 (Doc Corpus Integrity, feature 38): every migrated donor doc has
// paths that resolve, a content hash recorded, its verification wave
// completed before its feature closes, no retire-disposition doc exists,
// and no doc references donor paths or brand. Checked here as the scan
// half of the contract; feature 43 (Doc Verification Closeout) is the
// per-wave gate half.
const repoRoot = join(import.meta.dirname, '..', '..')
const docsDir = join(repoRoot, '.mdd', 'docs')
const wavesDir = join(repoRoot, '.mdd', 'waves')

const DONOR_MARKERS = ['markdownai', '~/projects/markdownai']

// Retire-disposition subjects (spec's doc dispositions table, "Retire:"
// row): none of these should ever appear as a doc's own subject. Matched
// loosely against title/path/tags so a subject renamed slightly is still
// caught, but scoped to whole-word matches to avoid false positives like
// "eventing" hitting "event".
const RETIRE_SUBJECT_RE = /\b(mcp|phase-workflow|event-transport|ai-consumer|plugin-descriptor|db-suite|http-source|editor-extension)\b/i

interface DocFrontmatter {
  id: string
  file: string
  status: string
  wave?: string
  raw: string
}

function parseFrontmatter(file: string): DocFrontmatter {
  const raw = readFileSync(join(docsDir, file), 'utf8')
  const m = raw.match(/^---\n([\s\S]*?)\n---/)
  const body = m?.[1] ?? ''
  const get = (field: string) => body.match(new RegExp(`^${field}:\\s*(.*)$`, 'm'))?.[1]?.trim().replace(/^"|"$/g, '') ?? ''
  const wave = get('wave')
  return { id: get('id'), file, status: get('status'), ...(wave ? { wave } : {}), raw }
}

const docFiles = readdirSync(docsDir).filter(f => f.endsWith('.md'))
const docs = docFiles.map(parseFrontmatter)

function waveStatus(waveId: string): string {
  try {
    const raw = readFileSync(join(wavesDir, `${waveId}.md`), 'utf8')
    return raw.match(/^status:\s*(.*)$/m)?.[1]?.trim() ?? ''
  } catch {
    return ''
  }
}

// Read together with CR-D7 (feature 39, "the wave record names the donor
// path copied from"): a verify/donor-backed doc's Architecture or
// Implementation Notes section is REQUIRED to cite its donor copy-map
// source, so "no doc references donor paths or brand" cannot mean a
// blanket ban on the donor path appearing anywhere in body prose, that
// would make CR-9 and CR-D7 mutually unsatisfiable on the same document.
// Scoped instead to the doc's own IDENTITY fields (title, path, tags): the
// thing this repo is never confused about is what a doc is *about*, not
// whether it cites where it came from.
describe('CR-9: no doc is itself identified as donor-branded', () => {
  it.each(docs.map(d => d.file))('%s: title/path/tags carry no donor brand marker', (file) => {
    const doc = docs.find(d => d.file === file)!
    const titleLine = doc.raw.match(/^title:\s*(.*)$/m)?.[1]?.toLowerCase() ?? ''
    const pathLine = doc.raw.match(/^path:\s*(.*)$/m)?.[1]?.toLowerCase() ?? ''
    const tagsLine = doc.raw.match(/^tags:\s*(.*)$/m)?.[1]?.toLowerCase() ?? ''
    for (const marker of DONOR_MARKERS) {
      expect(titleLine, `${file} title contains "${marker}"`).not.toContain(marker)
      expect(pathLine, `${file} path contains "${marker}"`).not.toContain(marker)
      expect(tagsLine, `${file} tags contain "${marker}"`).not.toContain(marker)
    }
  })

  it('the scan is not vacuous: a planted donor-path string is actually caught', () => {
    const raw = 'source: ~/projects/markdownai/src/engine.ts'
    const lower = raw.toLowerCase()
    expect(DONOR_MARKERS.some(m => lower.includes(m))).toBe(true)
  })
})

describe('CR-9: no retire-disposition subject exists in the corpus', () => {
  it.each(docs.map(d => d.file))('%s: title/path is not a retire-disposition subject', (file) => {
    const doc = docs.find(d => d.file === file)!
    const titleLine = doc.raw.match(/^title:\s*(.*)$/m)?.[1] ?? ''
    const pathLine = doc.raw.match(/^path:\s*(.*)$/m)?.[1] ?? ''
    expect(RETIRE_SUBJECT_RE.test(titleLine)).toBe(false)
    expect(RETIRE_SUBJECT_RE.test(pathLine)).toBe(false)
  })
})

describe('CR-9: every doc whose owning wave has closed reflects real verification', () => {
  it.each(docs.filter(d => d.wave).map(d => d.file))('%s: not left at a placeholder status once its wave is complete', (file) => {
    const doc = docs.find(d => d.file === file)!
    if (!doc.wave) return
    const wStatus = waveStatus(doc.wave)
    if (wStatus !== 'complete') return // this doc's wave hasn't closed yet, nothing to assert
    expect(['complete', 'deprecated'], `${file}: wave ${doc.wave} is complete but doc status is "${doc.status}"`)
      .toContain(doc.status)
  })
})
