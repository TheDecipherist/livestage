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

// A YAML block under a key: either a scalar list (`- a`) or a list of objects
// (`- k: v` then indented `k2: v2`). Returns strings for the former, objects
// for the latter. Used for source_files/tags (scalars) and the contract fields
// (objects).
function parseBlock(blockLines) {
  const items = [];
  let cur = null;
  for (const raw of blockLines) {
    const dash = raw.match(/^\s*-\s+(.*)$/);
    if (dash) {
      const kv = dash[1].match(/^([A-Za-z0-9_]+):\s*(.*)$/);
      if (kv) {
        cur = {};
        cur[kv[1]] = unquote(kv[2]);
        items.push(cur);
      } else {
        items.push(unquote(dash[1]));
        cur = null;
      }
    } else {
      const kv = raw.match(/^\s+([A-Za-z0-9_]+):\s*(.*)$/);
      if (kv && cur && typeof cur === 'object') cur[kv[1]] = unquote(kv[2]);
    }
  }
  return items;
}

function parseFrontmatter(text) {
  if (!text.startsWith('---')) return null;
  const end = text.indexOf('\n---', 3);
  if (end === -1) return null;
  const lines = text.slice(3, end).replace(/^\r?\n/, '').split(/\r?\n/);
  const fm = {};
  const present = new Set();
  let i = 0;
  while (i < lines.length) {
    const m = lines[i].match(/^([A-Za-z0-9_]+):\s*(.*)$/);
    if (!m) { i++; continue; }
    const key = m[1], val = m[2];
    present.add(key);
    if (val === '') {
      const block = [];
      let j = i + 1;
      while (j < lines.length && (/^\s+\S/.test(lines[j]) || lines[j].trim() === '')) {
        if (lines[j].trim() !== '') block.push(lines[j]);
        j++;
      }
      fm[key] = parseBlock(block);
      i = block.length ? j : i + 1;
      continue;
    } else if (val.startsWith('[')) {
      const inner = val.replace(/^\[/, '').replace(/\]$/, '').trim();
      fm[key] = inner ? inner.split(',').map(unquote).filter(Boolean) : [];
      i++;
      continue;
    }
    fm[key] = unquote(val);
    i++;
  }
  return { fields: fm, present };
}

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

  if (Array.isArray(fm.tags))
    for (const t of fm.tags)
      if (typeof t === 'string' && (/\.(ts|tsx|js|jsx|md|json|sh)$/.test(t) || t.includes('/')))
        warnings.push(`tag "${t}" looks like a file path, tags are domain concepts`);

  return { errors, warnings };
}

process.stdout.write(JSON.stringify(validate(process.argv[2])));
