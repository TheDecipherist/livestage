'use strict';
// MDD frontmatter validator. Called by the frontmatter-validate hook on every
// write to .mdd/docs/*.md. Validates one doc against .mdd/00-frontmatter-spec.md
// and prints {"errors":[...],"warnings":[...]} as JSON. Errors are hard schema
// violations (the hook blocks on them); warnings are surfaced but do not block.
// Dependency-free node, env-overridable (MDD_DIR/MDD_DOCS) for the fixture suite.
const fs = require('fs');
const path = require('path');

const DOCS = process.env.MDD_DOCS || path.join('.mdd', 'docs');
const MDD_DIR = process.env.MDD_DIR || '.mdd';
const INITIATIVES = path.join(MDD_DIR, 'initiatives');

const REQUIRED = ['id', 'title', 'type', 'path', 'source_files', 'status', 'phase', 'last_synced'];
const TYPES = ['COMPONENT', 'SPEC', 'task'];
const STATUSES = ['planned', 'active', 'in_progress', 'complete', 'deprecated'];
const PHASES = ['idle', 'understand', 'document', 'red', 'implement', 'verify', 'integration-pending', 'all'];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const ID_NUM_RE = /^(\d+)-/;
const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;
const LOCATOR_RE = /^\S+\.[A-Za-z0-9]+:(\d+|:.+)$/;
const unquote = (s) => s.replace(/^["']|["']$/g, '').trim();
const asArr = (v) => (Array.isArray(v) ? v : []);

const { parseFrontmatter } = require('./fm-parse.cjs');

function loadAllDocs() {
  const map = {};
  let files = [];
  try { files = fs.readdirSync(DOCS).filter((f) => f.endsWith('.md')); } catch { return map; }
  for (const f of files) {
    try {
      const p = parseFrontmatter(fs.readFileSync(path.join(DOCS, f), 'utf8'));
      if (p) map[p.fields.id || f.replace(/\.md$/, '')] = p.fields;
    } catch {}
  }
  return map;
}

function validate(targetPath) {
  const errors = [], warnings = [];
  let text;
  try { text = fs.readFileSync(targetPath, 'utf8'); } catch { return { errors: ['cannot read file'], warnings }; }
  const parsed = parseFrontmatter(text);
  if (!parsed) return { errors: ['no YAML frontmatter block (every feature doc needs one)'], warnings };
  const fm = parsed.fields, present = parsed.present;
  // NOTHING drops silently: any line the parser could not place is a hard
  // error, because a skipped line is a silently absent field and everything
  // downstream then reasons about a doc that is not the doc on disk.
  for (const pr of parsed.problems)
    errors.push(`frontmatter line ${pr.line} not parseable (${pr.why}): ${String(pr.text).trim()}`);
  const fileId = path.basename(targetPath).replace(/\.md$/, '');

  for (const k of REQUIRED) if (!present.has(k)) errors.push(`missing required field: ${k}`);
  if (present.has('id') && fm.id !== fileId) errors.push(`id "${fm.id}" does not match filename "${fileId}"`);
  if (present.has('type') && !TYPES.includes(fm.type)) errors.push(`type "${fm.type}" is not one of ${TYPES.join(', ')}`);
  if (present.has('status') && !STATUSES.includes(fm.status)) errors.push(`status "${fm.status}" is not one of ${STATUSES.join(', ')}`);
  if (present.has('phase') && !PHASES.includes(fm.phase)) errors.push(`phase "${fm.phase}" is not one of ${PHASES.join(', ')}`);
  if (present.has('last_synced') && !DATE_RE.test(String(fm.last_synced))) errors.push(`last_synced "${fm.last_synced}" is not YYYY-MM-DD`);

  const allDocs = loadAllDocs();
  const depends = asArr(fm.depends_on).filter((d) => typeof d === 'string');
  const thisNum = (fileId.match(ID_NUM_RE) || [])[1];

  if (fm.type === 'SPEC') {
    if (asArr(fm.source_files).length > 0) errors.push(`SPEC "${fileId}" must have empty source_files (a contract implements nothing)`);
    for (const dep of depends)
      if (allDocs[dep] && allDocs[dep].type === 'COMPONENT')
        errors.push(`SPEC "${fileId}" depends_on COMPONENT "${dep}"; a SPEC's depends_on must not contain a COMPONENT`);
  }

  for (const dep of depends) {
    if (!allDocs[dep]) errors.push(`depends_on references unknown doc "${dep}"`);
    const dn = (String(dep).match(ID_NUM_RE) || [])[1];
    if (thisNum && dn && Number(dn) >= Number(thisNum))
      errors.push(`depends_on "${dep}" is not a lower id than "${fileId}"; build order requires depends_on to point to lower ids only`);
  }

  if (present.has('initiative') && fm.initiative && fm.initiative !== 'none' && !fs.existsSync(path.join(INITIATIVES, `${fm.initiative}.md`)))
    errors.push(`initiative "${fm.initiative}" has no backing file at ${path.join(INITIATIVES, `${fm.initiative}.md`)}`);

  // --- Contracts: the declaring side (integration_contracts) and the
  // dependent side (satisfies_contracts) must be shaped correctly and must
  // reciprocate. This is what makes a SPEC/provider guarantee machine-verified.
  const ownICs = asArr(fm.integration_contracts).filter((x) => x && typeof x === 'object');
  for (const ic of ownICs)
    if (!ic.function || !ic.when || ic.mandatory === undefined)
      errors.push(`integration_contracts entry must have function/when/mandatory`);

  const satisfies = asArr(fm.satisfies_contracts).filter((x) => x && typeof x === 'object');
  for (const sc of satisfies) {
    const miss = ['from', 'function', 'when', 'status'].filter((k) => !sc[k]);
    if (miss.length) errors.push(`satisfies_contracts entry missing ${miss.join('/')}`);
    if (sc.from && !allDocs[sc.from]) errors.push(`satisfies_contracts from "${sc.from}" is not a known doc`);
    if (sc.status && !['pending', 'done'].includes(sc.status)) errors.push(`satisfies_contracts status "${sc.status}" must be pending or done`);
    if (sc.status === 'done') {
      if (!sc.verified_at) errors.push(`satisfies_contracts for "${sc.function}" is done but has no verified_at`);
      else if (DATE_ONLY_RE.test(sc.verified_at)) errors.push(`satisfies_contracts verified_at "${sc.verified_at}" is a date, not proof; use a test locator like tests/x.test.ts:42`);
      else if (!LOCATOR_RE.test(sc.verified_at)) errors.push(`satisfies_contracts verified_at "${sc.verified_at}" must be a file locator (path.ext:line or path.ext::name)`);
    }
    if (fm.status === 'complete' && sc.status === 'pending') errors.push(`doc is complete but contract ${sc.from}/${sc.function} is still pending`);
  }

  // Reciprocity: every mandatory contract a dependency declares must be satisfied here.
  for (const dep of depends) {
    const dd = allDocs[dep];
    if (!dd) continue;
    for (const ic of asArr(dd.integration_contracts).filter((x) => x && typeof x === 'object')) {
      const mand = ic.mandatory === true || ic.mandatory === 'true';
      if (!mand) continue;
      if (!satisfies.some((sc) => sc.from === dep && sc.function === ic.function))
        errors.push(`unsatisfied contract: depends_on "${dep}" declares mandatory ${ic.function}; add a satisfies_contracts entry {from: ${dep}, function: ${ic.function}}`);
    }
  }

  // --- test_files completion gate (the livestage lesson: 28 of 48 complete
  // COMPONENT docs had real tests on disk, cited by name in their own
  // Acceptance Criteria prose, and an empty structured field pointing at
  // them). The producing steps (build Phase 7, plan-execute completion) are
  // instructions; this is the enforcement. A COMPONENT that implements real
  // source files cannot CLAIM completion while test_files is empty, because
  // the ground truth exists by then: Phase 4 wrote the red-gate files and
  // Phase 6 made them green, so an empty field at completion time is always
  // a recording failure, never a timing one. Same shape as the
  // SPEC/source_files and complete-while-pending-contract blocks above.
  // The ONLY way past it is loud: a tagged known_issues entry that mentions
  // tests. "[deferred] no independently testable behavior: <why>" for the
  // genuine decision, or "[gap] test_files unknown, tests undiscovered" when
  // /upgrade migrates a legacy doc whose tests it cannot locate. Both land in
  // the audit's Open Items Backlog, so neither is ever silent. A schema
  // exception with no entry does not exist.
  const kiEntries = asArr(fm.known_issues).filter((k) => typeof k === 'string');
  const testsDeferred = kiEntries.some((k) => /\[(deferred|gap)\]/i.test(k) && /\btests?\b|\btestab|test_files/i.test(k));
  if (
    fm.type === 'COMPONENT' &&
    asArr(fm.source_files).length > 0 &&
    ['complete', 'in_progress'].includes(fm.status) &&
    asArr(fm.test_files).length === 0 &&
    !testsDeferred
  ) {
    errors.push(
      `COMPONENT "${fileId}" is ${fm.status} with ${asArr(fm.source_files).length} source_files but empty test_files; ` +
      `list the real test files (Phase 4/6 wrote them, they exist on disk), or record a ` +
      `known_issues "[deferred] no independently testable behavior: <why>" entry if that is genuinely true`
    );
  }
  // Disk-existence gate: a doc CLAIMING completion cannot point at files that
  // are not there. Planned/active docs legitimately list files that do not
  // exist yet (MDD writes the doc before the code), so this only fires once
  // the doc says the work is done. Kills "listed but imaginary" the same way
  // the empty-test_files gate kills "real but unlisted". MDD_SRC_ROOT is the
  // fixture seam; the real runtime resolves from the project root.
  const SRC_ROOT = process.env.MDD_SRC_ROOT || '.';
  if (['complete', 'in_progress'].includes(fm.status)) {
    for (const f of asArr(fm.source_files).filter((s) => typeof s === 'string'))
      if (!fs.existsSync(path.join(SRC_ROOT, f)))
        errors.push(`source_files "${f}" does not exist on disk; a ${fm.status} doc cannot list phantom files`);
    for (const f of asArr(fm.test_files).filter((s) => typeof s === 'string'))
      if (!fs.existsSync(path.join(SRC_ROOT, f)))
        errors.push(`test_files "${f}" does not exist on disk; a ${fm.status} doc cannot list phantom tests`);
  }

  // Drift companion (warn, not block): test paths cited in the body prose
  // (Acceptance Criteria, Bug Fixes) that the structured field does not
  // carry. Prose is where the truth kept landing while the field stayed
  // empty; surface the gap every time the doc is written.
  {
    const bodyStart = text.indexOf('---', 4);
    const bodyText = bodyStart === -1 ? '' : text.slice(bodyStart + 3);
    const cited = new Set();
    const re = /[\w@./-]*[\w-]\.(?:test|spec)\.[a-z]{1,4}\b/g;
    let m;
    while ((m = re.exec(bodyText)) !== null) cited.add(m[0]);
    const tf = asArr(fm.test_files).filter((t) => typeof t === 'string');
    const missing = [...cited].filter((c) => {
      const base = c.split('/').pop();
      return !tf.some((t) => t === c || t.endsWith('/' + base) || t.split('/').pop() === base);
    });
    if (missing.length)
      warnings.push(`body cites test file(s) not listed in test_files: ${missing.slice(0, 6).join(', ')}${missing.length > 6 ? ` (+${missing.length - 6} more)` : ''}; the structured field is what tools read, prose is not`);
  }

  if (Array.isArray(fm.tags))
    for (const t of fm.tags)
      if (typeof t === 'string' && (/\.(ts|tsx|js|jsx|md|json|sh)$/.test(t) || t.includes('/')))
        warnings.push(`tag "${t}" looks like a file path, tags are domain concepts`);

  // primitives: the queryable record of callable surfaces this doc documents.
  // Lets any tool find "every doc that documents a directive" with zero
  // path-convention guessing. kind is FREE-FORM (lowercase kebab-case), not an
  // enum: MDD generalizes across arbitrary project types (directive, cli-verb,
  // endpoint, driver, ui-component, ...); the corpus keeps kinds consistent by
  // convention, not by schema.
  const prims = asArr(fm.primitives);
  for (const p of prims) {
    if (!p || typeof p !== 'object') { errors.push('primitives entries must be objects with name and kind'); continue; }
    if (!p.name || typeof p.name !== 'string') errors.push('primitives entry missing name');
    if (!p.kind || typeof p.kind !== 'string') errors.push(`primitives entry "${p.name || '?'}" missing kind`);
    else if (!/^[a-z][a-z0-9-]*$/.test(p.kind)) errors.push(`primitives kind "${p.kind}" must be lowercase kebab-case (e.g. directive, cli-verb, endpoint, driver, ui-component)`);
  }
  if (prims.length > 0) {
    const body = text.slice(text.indexOf('---', 4) + 3);
    // The MDD-internal sections stay; substring tooling matches headings by
    // exact spelling, and a near-miss silently vanishes instead of erroring.
    if (!/^##\s+API\/Interface\s*$/m.test(body))
      errors.push('doc declares primitives but has no "## API/Interface" heading (exact spelling; a near-miss silently drops it from every generated view)');
    if (!/^##\s+Business Rules\s*$/m.test(body))
      errors.push('doc declares primitives but has no "## Business Rules" heading (exact spelling)');
    // Interface Overview: the one section written for a total stranger. Required
    // whenever the doc documents callable surfaces, with one ### sub-heading per
    // primitive whose text is the primitive's exact identifier, so a generator
    // pulls one primitive's blurb+table with a single exact heading match and a
    // coverage check can verify per primitive, not just per doc.
    if (!/^##\s+Interface Overview\s*$/m.test(body)) {
      errors.push('doc declares primitives but has no "## Interface Overview" section (the human-readable section: per-primitive ### heading, one-to-two-sentence blurb, Parameter/Values/Description table)');
    } else {
      const ioStart = body.search(/^##\s+Interface Overview\s*$/m);
      const rest = body.slice(ioStart);
      const nextH2 = rest.slice(3).search(/^##\s+[^#]/m);
      const ioSection = nextH2 === -1 ? rest : rest.slice(0, nextH2 + 3);
      // Three parts, in order: Part 1 prose overview (no heading of its own),
      // Part 2 quick table, Part 3 per-primitive sub-sections.
      const firstH3 = ioSection.search(/^###\s+/m);
      const preamble = firstH3 === -1 ? ioSection : ioSection.slice(0, firstH3);
      const tblIdx = preamble.search(/^\|\s*Name\s*\|\s*What it does\s*\|/m);
      if (tblIdx === -1) {
        errors.push('Interface Overview needs the quick table (header exactly "| Name | What it does |", one row per primitive) after the Part 1 prose overview and before the per-primitive ### sections');
      } else {
        // Part 1: a short prose overview BEFORE the quick table, what this set
        // of primitives is as a whole and why someone reaches for it. Presence
        // is enforced (a reader must not land on a table with zero framing);
        // length and quality stay judgment.
        const beforeTable = preamble.slice(0, tblIdx);
        const prose = beforeTable
          .split('\n')
          .filter((l) => {
            const t = l.trim();
            return t && !t.startsWith('#') && !t.startsWith('|') && !/^-{3,}$/.test(t);
          })
          .join(' ')
          .trim();
        if (!prose)
          errors.push('Interface Overview must open with a short prose overview (1 to 2 paragraphs, no heading of its own: what this set of primitives is as a whole and why someone reaches for it) BEFORE the quick table; a reader must not land on a table with zero framing');
        // Part 2: the quick table, one row per primitive.
        for (const p of prims) {
          if (!p || typeof p !== 'object' || !p.name) continue;
          const escQ = String(p.name).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          if (!new RegExp('^\\|[^|\\n]*' + escQ + '[^|\\n]*\\|', 'm').test(preamble))
            errors.push(`Interface Overview quick table has no row for "${p.name}"`);
        }
      }
      // Part 3: one ### per primitive, exact identifier as the heading.
      for (const p of prims) {
        if (!p || typeof p !== 'object' || !p.name) continue;
        const esc = String(p.name).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        if (!new RegExp('^###\\s+' + esc + '\\s*$', 'm').test(ioSection))
          errors.push(`Interface Overview has no "### ${p.name}" sub-heading; every primitive gets one, headed by its exact identifier`);
      }
      // Jargon early-warning (warn, not block: false positives are possible).
      // Internal citations read as changelog to a stranger; they belong in
      // Business Rules / Known Issues, never in Interface Overview.
      const jargon = [];
      if (/\(line\s+\d+\)/.test(ioSection)) jargon.push('(line NNN) citation');
      if (/\bfeature\s+\d+\b/i.test(ioSection)) jargon.push('feature-number reference');
      if (/\bCR-\d+\b/.test(ioSection)) jargon.push('CR-reference');
      if (/\bRESOLVED\s*\(/.test(ioSection)) jargon.push('RESOLVED (date) note');
      if (/\bwave\s+\d+\b/i.test(ioSection)) jargon.push('wave reference');
      if (jargon.length)
        warnings.push(`Interface Overview contains internal jargon (${jargon.join(', ')}); this section is for a stranger with zero project context, move history and citations to Business Rules/Known Issues`);
    }
  }

  return { errors, warnings };
}

// Exported so mdd-sweep (the end-of-turn corpus sweep) can validate every doc
// in ONE node process instead of one process per doc. CLI behavior unchanged.
module.exports = { validate };
if (require.main === module) process.stdout.write(JSON.stringify(validate(process.argv[2])));
