#!/usr/bin/env node
/**
 * Status bar feed writer. The MDD skills call this alongside every user-facing
 * step line, so the status bar (.claude/statusline.cjs) mirrors what the skill
 * says it is doing. Best-effort: never throws, never blocks a skill.
 *
 *   node .claude/hooks/lib/statusbar.cjs set <flow> <index> <total> "<label>"
 *   node .claude/hooks/lib/statusbar.cjs done <flow> ["<label>"]
 *   node .claude/hooks/lib/statusbar.cjs clear
 *
 * Writes .mdd/.statusbar.json atomically:
 *   { "flow": "build", "index": 3, "total": 7, "label": "Writing the feature doc",
 *     "status": "running", "ts": 1690000000000 }
 */
'use strict';

const { writeFileSync, renameSync, unlinkSync, mkdirSync, existsSync, readFileSync } = require('node:fs');
const { join, dirname } = require('node:path');

// startTs marks the beginning of the current run: it resets when a NEW flow
// starts (different flow name, or a set after a done, or no prior file) and is
// preserved across every later set of the same run, so the status bar's
// elapsed timer runs 00:00 upward per MDD command and freezes at done.
function currentStart(path, flow) {
  try {
    const prev = JSON.parse(readFileSync(path, 'utf8'));
    if (prev && prev.flow === flow && prev.status === 'running' && typeof prev.startTs === 'number') {
      return prev.startTs;
    }
  } catch { /* no prior run */ }
  return Date.now();
}

function main() {
  try {
    const cwd = process.env.CLAUDE_PROJECT_DIR || process.cwd();
    const path = join(cwd, '.mdd', '.statusbar.json');
    const [cmd, flow, index, total, ...rest] = process.argv.slice(2);

    if (cmd === 'clear') {
      try { unlinkSync(path); } catch { /* already gone */ }
      return;
    }
    if (cmd === 'done') {
      write(path, { flow: flow || undefined, label: index !== undefined ? [index, total, ...rest].filter(Boolean).join(' ') : undefined, status: 'done', ts: Date.now(), startTs: currentStart(path, flow) });
      return;
    }
    if (cmd === 'set') {
      write(path, {
        flow: flow || undefined,
        index: toNum(index),
        total: toNum(total),
        label: rest.join(' ') || undefined,
        status: 'running',
        ts: Date.now(),
        startTs: currentStart(path, flow),
      });
      return;
    }
    // Unknown command: ignore, never fail the caller.
  } catch { /* best-effort */ }
}

function toNum(v) {
  const n = Number.parseInt(v ?? '', 10);
  return Number.isFinite(n) ? n : undefined;
}

function write(path, value) {
  const dir = dirname(path);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(value)}\n`, 'utf8');
  renameSync(tmp, path);
}

main();
