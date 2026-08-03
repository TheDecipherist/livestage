'use strict';
// The ONE frontmatter parser for the MDD kit. frontmatter-validate.cjs and
// connections-gen.cjs both require this; there is deliberately no second
// implementation anywhere, because two parsers with the same bugs is how a
// wrapped known_issues line got truncated and an object-list lost every key
// but the first (mdd field report, 2026-08).
//
// Scope: the YAML subset real frontmatter is written in, in EVERY common
// style, because authors should not have to know which flavor the kit
// happens to like:
//   - block mappings and nested mappings (indentation-based)
//   - block sequences of scalars and of mappings, nested to any depth
//   - flow style: {k: v, k2: [a, b]} and [a, {b: c}], nested, multi-line
//   - plain scalars with YAML line folding (wrapped continuation lines)
//   - single- and double-quoted scalars, colons and # inside quotes
//   - literal | and folded > block scalars, with - chomping
//   - comments (# to end of line, outside quotes) and blank lines, CRLF
// NOT parsed, recorded loudly instead: anchors/aliases (& *), tags (!),
// directives (%), and anything else outside the subset.
//
// Design rule, load-bearing: NOTHING DROPS SILENTLY. Every line the parser
// cannot place is recorded in `problems` with its 1-based line number (line
// numbers count from the opening --- as line 1), and the validator turns
// problems into blocking errors. A parser that skips what it does not
// understand converts a typo into a silently absent field, and everything
// downstream (contracts, doctor, connections) then reasons about a doc that
// is not the doc on disk.
//
// API: parseFrontmatter(text) -> { fields, present:Set, problems:[{line,text,why}] }
//      null when there is no frontmatter block at all.

function stripComment(s) {
  let q = null;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (q) {
      if (ch === q) q = null;
    } else if (ch === '"' || ch === "'") {
      q = ch;
    } else if (ch === '#' && (i === 0 || s[i - 1] === ' ' || s[i - 1] === '\t')) {
      return s.slice(0, i);
    }
  }
  return s;
}

function unquote(s) {
  const t = s.trim();
  if (t.length >= 2 && t[0] === '"' && t[t.length - 1] === '"') {
    return t.slice(1, -1).replace(/\\"/g, '"').replace(/\\n/g, '\n').replace(/\\\\/g, '\\');
  }
  if (t.length >= 2 && t[0] === "'" && t[t.length - 1] === "'") {
    return t.slice(1, -1).replace(/''/g, "'");
  }
  return t;
}

function coerce(s) {
  const t = s.trim();
  if (/^["']/.test(t)) return unquote(t);
  if (t === 'true') return true;
  if (t === 'false') return false;
  if (t === 'null' || t === '~' || t === '') return t === '' ? '' : null;
  return t;
}

// ---- flow-style parser: {..}, [..], nested, quotes ----
function parseFlow(src, pos) {
  // returns [value, nextPos] or throws {message}
  while (pos < src.length && /\s/.test(src[pos])) pos++;
  const ch = src[pos];
  if (ch === '{') {
    const obj = {};
    pos++;
    for (;;) {
      while (pos < src.length && /[\s,]/.test(src[pos])) pos++;
      if (src[pos] === '}') return [obj, pos + 1];
      if (pos >= src.length) throw new Error('flow mapping never closes with }');
      const keyStart = pos;
      while (pos < src.length && src[pos] !== ':' && src[pos] !== '}' && src[pos] !== ',') pos++;
      if (src[pos] !== ':') throw new Error('flow mapping entry missing ":"');
      const key = unquote(src.slice(keyStart, pos));
      pos++;
      const [val, np] = parseFlow(src, pos);
      obj[key] = val;
      pos = np;
    }
  }
  if (ch === '[') {
    const arr = [];
    pos++;
    for (;;) {
      while (pos < src.length && /[\s,]/.test(src[pos])) pos++;
      if (src[pos] === ']') return [arr, pos + 1];
      if (pos >= src.length) throw new Error('flow sequence never closes with ]');
      const [val, np] = parseFlow(src, pos);
      arr.push(val);
      pos = np;
    }
  }
  if (ch === '"' || ch === "'") {
    let end = pos + 1;
    while (end < src.length) {
      if (src[end] === ch && !(ch === '"' && src[end - 1] === '\\')) break;
      end++;
    }
    if (end >= src.length) throw new Error('unclosed quote in flow value');
    return [unquote(src.slice(pos, end + 1)), end + 1];
  }
  // plain flow scalar: up to , } ] at this level
  let end = pos;
  while (end < src.length && !/[,\}\]]/.test(src[end])) end++;
  return [coerce(src.slice(pos, end)), end];
}

// A scalar buffer that OPENED with a quote and has not closed it yet is
// mid-string: every following line is continuation text by definition,
// no matter how key-shaped it looks ("predicted: ...", "dead: ...").
// That exact shape truncated five real docs' wrapped known_issues prose:
// the fold loops judged the NEXT line by its own shape alone and stopped
// at any word+colon. Deliberately NOT a general parity counter: a plain
// unquoted scalar containing an apostrophe (it's) has odd parity forever
// and a parity counter would swallow the rest of the frontmatter. Only a
// value that STARTS with " or ' is in a quoted context, and each style
// closes by its own rule: unescaped " for double, non-doubled ' for single.
function stillOpenQuote(buf) {
  const t = buf.replace(/^\s+/, '');
  const q = t[0];
  if (q !== '"' && q !== "'") return false;
  if (q === '"') {
    for (let i = 1; i < t.length; i++) {
      if (t[i] === '\\') { i++; continue; }
      if (t[i] === '"') return false;
    }
    return true;
  }
  for (let i = 1; i < t.length; i++) {
    if (t[i] === "'") {
      if (t[i + 1] === "'") { i++; continue; }
      return false;
    }
  }
  return true;
}

// ---- block parser over indented lines ----
function parseFrontmatter(text) {
  if (!text.startsWith('---')) return null;
  const end = text.indexOf('\n---', 3);
  if (end === -1) return null;
  const rawAll = text.slice(3, end).replace(/^\r?\n/, '').split(/\r?\n/).map((l) => l.replace(/\r$/, ''));

  const problems = [];
  const problem = (idx, why) => problems.push({ line: idx + 2, text: rawAll[idx], why });

  // Pre-scan for the constructs we refuse, loudly.
  rawAll.forEach((l, idx) => {
    const s = stripComment(l).trim();
    if (/^%/.test(s)) problem(idx, 'YAML directives are not supported in frontmatter');
    if (/(^|\s)[&*][A-Za-z0-9_]/.test(s) && !/^["']/.test(s)) problem(idx, 'YAML anchors/aliases are not supported in frontmatter');
  });

  const indentOf = (l) => l.match(/^\s*/)[0].length;
  const lines = rawAll.map((l, idx) => ({ idx, raw: l, body: stripComment(l) }))
    .filter((l) => l.body.trim() !== '');

  let p = 0; // cursor into lines

  function collectFlow(firstBody, startIdx) {
    // A flow value may span lines; accumulate until brackets balance.
    let buf = firstBody;
    const balanced = () => {
      let depth = 0, q = null;
      for (let i = 0; i < buf.length; i++) {
        const c = buf[i];
        if (q) { if (c === q && !(q === '"' && buf[i - 1] === '\\')) q = null; continue; }
        if (c === '"' || c === "'") q = c;
        else if (c === '{' || c === '[') depth++;
        else if (c === '}' || c === ']') depth--;
      }
      return depth <= 0 && q === null;
    };
    while (!balanced() && p < lines.length) {
      buf += ' ' + lines[p].body.trim();
      p++;
    }
    try {
      const [val] = parseFlow(buf, 0);
      return val;
    } catch (e) {
      problem(startIdx, e.message);
      return null;
    }
  }

  function collectBlockScalar(marker, parentIndent) {
    // | literal or > folded, with optional - chomping
    const keep = marker[0] === '|';
    const parts = [];
    while (p < lines.length && indentOf(lines[p].raw) > parentIndent) {
      parts.push(lines[p].raw.trim());
      p++;
    }
    const joined = keep ? parts.join('\n') : parts.join(' ');
    return marker.endsWith('-') ? joined.replace(/\n+$/, '') : joined;
  }

  function parseValueAfterKey(rest, keyIndent, atIdx) {
    const t = rest.trim();
    if (t === '') {
      // nested block (map, sequence) or empty
      if (p < lines.length && indentOf(lines[p].raw) > keyIndent) {
        return parseBlock(indentOf(lines[p].raw));
      }
      return '';
    }
    if (t === '|' || t === '|-' || t === '>' || t === '>-') return collectBlockScalar(t, keyIndent);
    if (t.startsWith('{') || t.startsWith('[')) return collectFlow(t, atIdx);
    // plain or quoted scalar, possibly folded across more-indented lines.
    // Inside an unclosed quote the dash/key heuristics are suspended: the
    // line is more of the string, whatever it looks like.
    let buf = t;
    while (p < lines.length && indentOf(lines[p].raw) > keyIndent) {
      if (!stillOpenQuote(buf) &&
          (/^\s*-\s/.test(lines[p].body) || /^\s*[A-Za-z0-9_."'\-]+\s*:/.test(lines[p].body))) break;
      buf += ' ' + lines[p].body.trim();
      p++;
    }
    return coerce(buf);
  }

  function parseBlock(indent) {
    // Decide sequence vs mapping from the first line at this indent.
    const first = lines[p];
    if (!first) return '';
    if (/^\s*-\s|^\s*-$/.test(first.body)) return parseSequence(indent);
    return parseMapping(indent);
  }

  function parseSequence(indent) {
    const items = [];
    while (p < lines.length) {
      const l = lines[p];
      const ind = indentOf(l.raw);
      if (ind < indent) break;
      const dm = l.body.match(/^(\s*)-(\s+(.*))?$/);
      if (!dm || ind !== indent) {
        if (ind >= indent && !dm) { problem(l.idx, 'expected a "- " list item at this indent'); p++; continue; }
        break;
      }
      p++;
      const rest = (dm[3] || '').trim();
      if (rest === '') {
        // item is a nested block on following lines
        if (p < lines.length && indentOf(lines[p].raw) > indent) items.push(parseBlock(indentOf(lines[p].raw)));
        else items.push('');
        continue;
      }
      const kv = rest.match(/^([A-Za-z0-9_."'-]+)\s*:\s*(.*)$/);
      if (kv && !/^["']/.test(rest)) {
        // object item: first key inline, more keys on deeper lines
        const obj = {};
        const itemIndent = indent + (dm[0].length - dm[0].replace(/^(\s*)-\s+/, '').length); // indent of content after "- "
        obj[unquote(kv[1])] = parseValueAfterKey(kv[2], itemIndent - 1, l.idx);
        while (p < lines.length && indentOf(lines[p].raw) > indent && !/^\s*-\s/.test(lines[p].body)) {
          const sub = lines[p];
          const skv = sub.body.trim().match(/^([A-Za-z0-9_."'-]+)\s*:\s*(.*)$/);
          if (skv && !/^["']/.test(sub.body.trim())) {
            p++;
            obj[unquote(skv[1])] = parseValueAfterKey(skv[2], indentOf(sub.raw), sub.idx);
          } else {
            // folded continuation of the last value
            const keys = Object.keys(obj);
            if (keys.length) {
              const lk = keys[keys.length - 1];
              if (typeof obj[lk] === 'string') { obj[lk] = coerce(obj[lk] + ' ' + sub.body.trim()); p++; continue; }
            }
            problem(sub.idx, 'unrecognized line inside an object list item');
            p++;
          }
        }
        items.push(obj);
        continue;
      }
      if (rest.startsWith('{') || rest.startsWith('[')) { items.push(collectFlow(rest, l.idx)); continue; }
      if (rest === '|' || rest === '>' || rest === '|-' || rest === '>-') { items.push(collectBlockScalar(rest, indent)); continue; }
      // scalar item, possibly folded across more-indented lines. Same rule
      // as parseValueAfterKey: an unclosed opening quote suspends the
      // dash/key stop-heuristics until the line that closes it.
      let buf = rest;
      while (p < lines.length && indentOf(lines[p].raw) > indent) {
        if (!stillOpenQuote(buf) &&
            (/^\s*-\s/.test(lines[p].body) || /^\s*[A-Za-z0-9_."'-]+\s*:\s/.test(lines[p].body))) break;
        buf += ' ' + lines[p].body.trim();
        p++;
      }
      items.push(coerce(buf));
    }
    return items;
  }

  function parseMapping(indent) {
    const obj = {};
    while (p < lines.length) {
      const l = lines[p];
      const ind = indentOf(l.raw);
      if (ind < indent) break;
      if (ind > indent) { problem(l.idx, 'unexpected deeper indentation (no key to attach to)'); p++; continue; }
      const kv = l.body.trim().match(/^([A-Za-z0-9_."'-]+)\s*:\s*(.*)$/);
      if (!kv) { problem(l.idx, 'expected "key: value" at this indent'); p++; continue; }
      p++;
      obj[unquote(kv[1])] = parseValueAfterKey(kv[2], ind, l.idx);
    }
    return obj;
  }

  const fields = parseMapping(0);
  const present = new Set(Object.keys(fields));
  return { fields, present, problems };
}

module.exports = { parseFrontmatter, unquote, coerce, parseFlow };
