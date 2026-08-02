#!/usr/bin/env node
/**
 * MDD status bar for Claude Code, ported from the mdd2 project's status-line
 * (render.ts / segments.ts / ansi.ts / session.ts) into one dependency-free
 * script. Wire in settings.json:
 *   "statusLine": { "type": "command", "command": "node $CLAUDE_PROJECT_DIR/.claude/statusline.cjs" }
 *
 * Line 1: [spinner] MDD [run progress 0-100%] [flow phase X/T label] | [model effort] CTX pct (win) | 5h pct | 7d pct | [LSP|NO-LSP] [Playwright|NO-Playwright]
 * Line 2: [branch dirty ahead/behind] | [last tool target] | [$ current AI command] | [elapsed MM:SS]
 *
 * Feeds (all best-effort, a missing or corrupt feed never breaks a render):
 *   stdin                        Claude Code session JSON (model, ctx, quotas)
 *   .mdd/.statusbar.json         { flow, index, total, label, status, ts }
 *                                written by the MDD skills via
 *                                node .claude/hooks/lib/statusbar.cjs
 *   .mdd/.state.json             fallback phase source for /build
 *   .mdd/.status-activity.json   last tool + target (PostToolUse hook)
 *   git                          branch, dirty count, ahead/behind
 */
'use strict';

const { readFileSync, statSync, existsSync } = require('node:fs');
const { execFileSync } = require('node:child_process');
const { join } = require('node:path');

const RESET = '\x1b[0m';
const SPINNER = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
const IDLE_AFTER_MS = 30 * 60 * 1000;
const DONE_LINGER_MS = 5 * 60 * 1000;
const GROUP_SEP = ' | ';
const ANSI_RE = /\x1b\[[0-9;]*m/g;

const PALETTE = {
  white: { r: 235, g: 235, b: 235 },
  dim: { r: 128, g: 128, b: 128 },
  green: { r: 80, g: 220, b: 120 },
  amber: { r: 240, g: 180, b: 70 },
  blue: { r: 90, g: 160, b: 245 },
  teal: { r: 70, g: 200, b: 200 },
  lavender: { r: 180, g: 160, b: 245 },
  red: { r: 235, g: 90, b: 90 },
  orange: { r: 245, g: 150, b: 70 },
};

function flowColor(flow) {
  switch (flow) {
    case 'build': return PALETTE.amber;
    case 'audit': return PALETTE.teal;
    case 'bug': return PALETTE.red;
    case 'wave': case 'plan-execute': case 'plan-initiative': case 'plan-wave': case 'plan-sync':
      return PALETTE.lavender;
    case 'import-spec': return PALETTE.green;
    case 'ops': case 'runop': case 'update-op': return PALETTE.orange;
    default: return PALETTE.white;
  }
}

function thresholdColor(pct) {
  if (pct >= 90) return PALETTE.red;
  if (pct >= 75) return PALETTE.amber;
  return PALETTE.green;
}

// ---- ANSI ----
function colorMode(env) {
  const ct = env.COLORTERM || '';
  if (ct.includes('truecolor') || ct.includes('24bit')) return 'truecolor';
  const term = env.TERM || '';
  if (term.includes('256') || term.includes('color')) return '256';
  return 'truecolor';
}

function rgbTo256({ r, g, b }) {
  if (r === g && g === b) {
    if (r < 8) return 16;
    if (r > 248) return 231;
    return Math.round(((r - 8) / 247) * 24) + 232;
  }
  return 16 + 36 * Math.round((r / 255) * 5) + 6 * Math.round((g / 255) * 5) + Math.round((b / 255) * 5);
}

function fg(text, rgb, mode) {
  if (mode === 'none' || text.length === 0) return text;
  if (mode === '256') return `\x1b[38;5;${rgbTo256(rgb)}m${text}${RESET}`;
  return `\x1b[38;2;${rgb.r};${rgb.g};${rgb.b}m${text}${RESET}`;
}

function hslToRgb(h, s, l) {
  const hue = ((h % 360) + 360) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = l - c / 2;
  let r1 = c, g1 = x, b1 = 0;
  if (hue >= 60 && hue < 120) { r1 = x; g1 = c; b1 = 0; }
  else if (hue >= 120 && hue < 180) { r1 = 0; g1 = c; b1 = x; }
  else if (hue >= 180 && hue < 240) { r1 = 0; g1 = x; b1 = c; }
  else if (hue >= 240 && hue < 300) { r1 = x; g1 = 0; b1 = c; }
  else if (hue >= 300) { r1 = c; g1 = 0; b1 = x; }
  return { r: Math.round((r1 + m) * 255), g: Math.round((g1 + m) * 255), b: Math.round((b1 + m) * 255) };
}

function rainbowText(text, nowMs, mode, cycleMs = 3000) {
  if (mode === 'none') return text;
  const base = (nowMs / cycleMs) * 360;
  let out = '';
  const chars = [...text];
  for (let i = 0; i < chars.length; i++) {
    out += fg(chars[i], hslToRgb(base + i * 18, 0.95, 0.6), mode);
  }
  return out;
}

// ---- formatters ----
function formatTokens(n) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1000) return `${Math.round(n / 1000)}K`;
  return String(n);
}

function mediumPath(p) {
  if (!p) return p;
  const parts = p.split('/').filter((s) => s.length > 0);
  if (parts.length <= 6) return p;
  return '…/' + parts.slice(-6).join('/');
}

// ---- stdin session (tolerant across Claude Code versions) ----
function getPath(obj, path) {
  let cur = obj;
  for (const key of path.split('.')) {
    if (cur === null || typeof cur !== 'object') return undefined;
    cur = cur[key];
  }
  return cur;
}
function numberAt(obj, paths) {
  for (const p of paths) { const v = getPath(obj, p); if (typeof v === 'number' && Number.isFinite(v)) return v; }
  return undefined;
}
function stringAt(obj, paths) {
  for (const p of paths) { const v = getPath(obj, p); if (typeof v === 'string' && v.length > 0) return v; }
  return undefined;
}
function shortModel(name) {
  const l = name.toLowerCase();
  if (l.includes('opus')) return 'opus';
  if (l.includes('sonnet')) return 'sonnet';
  if (l.includes('haiku')) return 'haiku';
  if (l.includes('fable')) return 'fable';
  return name;
}
function parseQuota(obj, bases) {
  for (const base of bases) {
    const percent = numberAt(obj, [`${base}.utilization`, `${base}.used_percentage`, `${base}.percent`]);
    if (percent !== undefined) return { percent };
  }
  return undefined;
}
function parseSession(raw) {
  if (!raw || raw.trim().length === 0) return { session: {} };
  let o;
  try { o = JSON.parse(raw); } catch { return { session: {} }; }
  const model = stringAt(o, ['model.display_name', 'model.id']) ??
    (typeof o.model === 'string' ? o.model : undefined);
  return {
    session: {
      model: model !== undefined ? shortModel(model) : undefined,
      contextPercent: numberAt(o, ['context_window.used_percentage', 'context.used_percentage', 'cost.context_used_percentage']),
      contextWindow: numberAt(o, ['context_window.context_window_size', 'context_window.max_tokens']),
      quota5h: parseQuota(o, ['rate_limits.five_hour', 'usage.five_hour', 'rate_limit.5h']),
      quota7d: parseQuota(o, ['rate_limits.seven_day', 'usage.seven_day', 'rate_limit.7d']),
      effortLevel: stringAt(o, ['effort.level']),
      exceedsContext: o.exceeds_200k_tokens === true,
    },
    cwd: stringAt(o, ['workspace.current_dir', 'workspace.project_dir', 'cwd']),
  };
}

// ---- tooling health (cheap probes, a few stat calls each) ----
function binOnPath(name) {
  const dirs = (process.env.PATH || '').split(':');
  for (const d of dirs) {
    if (d && existsSync(join(d, name))) return true;
  }
  return false;
}

// LSP: the plugin must be enabled AND the language-server binary on PATH.
// Half-configured is the silent-degrade state lsp-readiness warns about; the
// bar shows it as NO-LSP so the state is visible every second, not once.
function readLspStatus(cwd) {
  let enabled = false;
  const settings = readJson(join(cwd, '.claude', 'settings.json'));
  if (settings && settings.enabledPlugins) {
    for (const [k, v] of Object.entries(settings.enabledPlugins)) {
      if (v === true && k.toLowerCase().includes('lsp')) { enabled = true; break; }
    }
  }
  return enabled && binOnPath('typescript-language-server');
}

// Playwright: an MCP server entry in .mcp.json plus npx to launch it.
function readPlaywrightStatus(cwd) {
  let entry = false;
  const mcp = readJson(join(cwd, '.mcp.json'));
  if (mcp && mcp.mcpServers) {
    for (const k of Object.keys(mcp.mcpServers)) {
      if (k.toLowerCase().includes('playwright')) { entry = true; break; }
    }
  }
  return entry && binOnPath('npx');
}

function renderToolHealth(cwd, mode) {
  // Each tool carries its own identity color when healthy (LSP lavender,
  // Playwright teal); broken is always alarm red so red means one thing.
  const lsp = readLspStatus(cwd)
    ? fg('LSP', PALETTE.lavender, mode)
    : fg('NO-LSP', PALETTE.red, mode);
  const pw = readPlaywrightStatus(cwd)
    ? fg('Playwright', PALETTE.teal, mode)
    : fg('NO-Playwright', PALETTE.red, mode);
  return `${lsp} ${pw}`;
}

// ---- feeds ----
function readJson(path) {
  try { return JSON.parse(readFileSync(path, 'utf8')); } catch { return null; }
}

/** The skill-written feed, with .state.json as the /build fallback. */
function readFlow(cwd, nowMs) {
  const bar = readJson(join(cwd, '.mdd', '.statusbar.json'));
  if (bar && typeof bar.ts === 'number' && nowMs - bar.ts <= IDLE_AFTER_MS) {
    if (bar.status === 'done') {
      if (nowMs - bar.ts > DONE_LINGER_MS) return { status: 'idle' };
      return { status: 'done', flow: bar.flow, label: bar.label, startTs: bar.startTs, doneTs: bar.ts };
    }
    return {
      status: 'running',
      flow: typeof bar.flow === 'string' ? bar.flow : undefined,
      index: typeof bar.index === 'number' ? bar.index : undefined,
      total: typeof bar.total === 'number' ? bar.total : undefined,
      label: typeof bar.label === 'string' ? bar.label : undefined,
      startTs: typeof bar.startTs === 'number' ? bar.startTs : undefined,
    };
  }
  // Fallback: the build skill's state file.
  const state = readJson(join(cwd, '.mdd', '.state.json'));
  if (state && typeof state.phase === 'string' && state.phase !== 'idle') {
    const stateAge = fileAge(join(cwd, '.mdd', '.state.json'), nowMs);
    if (stateAge !== null && stateAge > IDLE_AFTER_MS) return { status: 'idle' };
    const map = { document: [3, 'Document'], red: [4, 'Red Gate'], implement: [6, 'Implement'], verify: [7, 'Verify'], 'integration-pending': [7, 'Integration Pending'] };
    const hit = map[state.phase];
    return {
      status: 'running', flow: 'build',
      index: hit ? hit[0] : undefined, total: 7,
      label: hit ? hit[1] : state.phase,
    };
  }
  return { status: 'idle' };
}

function fileAge(path, nowMs) {
  try { return nowMs - statSync(path).mtimeMs; } catch { return null; }
}

function readActivity(cwd) {
  const o = readJson(join(cwd, '.mdd', '.status-activity.json'));
  if (!o) return {};
  return {
    lastTool: typeof o.lastTool === 'string' ? o.lastTool : undefined,
    lastTarget: typeof o.lastTarget === 'string' && o.lastTarget.length > 0 ? o.lastTarget : undefined,
    lastCommand: typeof o.lastCommand === 'string' && o.lastCommand.length > 0 ? o.lastCommand : undefined,
  };
}

function git(args, cwd) {
  try {
    return execFileSync('git', ['-C', cwd, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch { return null; }
}
function readGit(cwd) {
  const branch = git(['branch', '--show-current'], cwd);
  if (branch === null) return {};
  const porcelain = git(['status', '--porcelain'], cwd);
  const uncommitted = porcelain === null ? 0 : porcelain.split('\n').filter((l) => l.trim()).length;
  const upstream = git(['rev-list', '--left-right', '--count', '@{u}...HEAD'], cwd);
  let ahead, behind;
  if (upstream !== null) {
    const parts = upstream.split(/\s+/);
    behind = Number(parts[0]); ahead = Number(parts[1]);
    if (!Number.isFinite(behind)) behind = undefined;
    if (!Number.isFinite(ahead)) ahead = undefined;
  }
  return { branch, uncommitted, ahead, behind };
}

// ---- segments ----
function renderSpinnerMdd(flow, mode, nowMs) {
  if (flow.status === 'running') {
    const frame = rainbowText(SPINNER[Math.floor(nowMs / 100) % SPINNER.length], nowMs, mode, 1500);
    return `${frame} ${rainbowText('MDD', nowMs, mode)}`;
  }
  if (flow.status === 'done') {
    return fg('✓ MDD', PALETTE.green, mode);
  }
  return `${fg('⣿', PALETTE.dim, mode)} ${fg('MDD', PALETTE.dim, mode)}`;
}

function renderFlow(flow, mode) {
  if (flow.status === 'idle' || !flow.flow) return '';
  const parts = [fg(flow.flow, flowColor(flow.flow), mode)];
  if (flow.status === 'done') {
    parts.push(fg('done', PALETTE.green, mode));
    return parts.join(' ');
  }
  if (flow.index !== undefined) {
    parts.push(fg(flow.total !== undefined ? `${flow.index}/${flow.total}` : `${flow.index}`, PALETTE.dim, mode));
  }
  if (flow.label) parts.push(fg(flow.label, PALETTE.lavender, mode));
  return parts.join(' ');
}

// Overall run progress (0-100%), derived from the flow's step index/total.
// Sits right after the MDD wordmark so "how far along is this run" is the
// first thing the eye lands on. Green at 100 (done), amber under way.
function renderProgress(flow, mode) {
  if (flow.status === 'done') return fg('100%', PALETTE.green, mode);
  if (flow.status !== 'running' || flow.index === undefined || !flow.total) return '';
  const pct = Math.min(100, Math.round((flow.index / flow.total) * 100));
  const color = pct >= 100 ? PALETTE.green : PALETTE.amber;
  return fg(`${pct}%`.padStart(3), color, mode);
}

function renderModelCtx(s, mode) {
  const parts = [];
  if (s.model) {
    let str = fg(s.model.padEnd(6), PALETTE.blue, mode);
    if (s.effortLevel) {
      const short = { low: 'lo', medium: 'md', high: 'hi', xhigh: 'xh', max: 'mx' }[s.effortLevel] ?? s.effortLevel.slice(0, 2);
      str += ` ${fg(short, PALETTE.dim, mode)}`;
    }
    parts.push(str);
  }
  if (s.contextPercent !== undefined) {
    const pct = `${Math.round(s.contextPercent)}%`;
    const pctStr = fg(pct, s.contextPercent >= 90 ? PALETTE.red : PALETTE.white, mode);
    const win = s.contextWindow !== undefined ? ` ${fg(`(${formatTokens(s.contextWindow)})`, PALETTE.dim, mode)}` : '';
    const overflow = s.exceedsContext ? ` ${fg('!', PALETTE.red, mode)}` : '';
    parts.push(`${fg('CTX', PALETTE.dim, mode)} ${pctStr}${win}${overflow}`);
  }
  return parts.join(' ');
}

function renderQuota(q, label, mode) {
  if (!q) return '';
  return `${fg(label, PALETTE.dim, mode)} ${fg(`${Math.round(q.percent)}%`, thresholdColor(q.percent), mode)}`;
}

function renderGitBranch(g, mode) {
  if (!g.branch) return '';
  let out = `${fg('⎇', PALETTE.dim, mode)} ${fg(g.branch, PALETTE.green, mode)}`;
  if (g.uncommitted > 0) out += ` ${fg(`✱${g.uncommitted}`, PALETTE.amber, mode)}`;
  if (g.ahead || g.behind) out += ` ${fg(`↑${g.ahead ?? 0}↓${g.behind ?? 0}`, PALETTE.dim, mode)}`;
  return out;
}

// Elapsed run time, MM:SS (H:MM:SS past an hour). Starts at 00:00 when a new
// MDD command begins (the writer resets startTs per run), ticks with every
// status-line refresh, freezes at done.
function formatElapsed(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const sec = total % 60;
  const pad = (n) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${pad(m)}:${pad(sec)}`;
}

function renderElapsed(flow, mode, nowMs) {
  if (flow.startTs === undefined) return '';
  if (flow.status === 'done') {
    return fg(formatElapsed((flow.doneTs ?? nowMs) - flow.startTs), PALETTE.green, mode);
  }
  if (flow.status !== 'running') return '';
  return fg(formatElapsed(nowMs - flow.startTs), PALETTE.white, mode);
}

function renderTool(a, mode) {
  if (!a.lastTool) return '';
  const target = a.lastTarget ? ` ${fg(mediumPath(a.lastTarget), PALETTE.dim, mode)}` : '';
  return `${fg(a.lastTool, PALETTE.teal, mode)}${target}`;
}

function renderCommand(a, mode) {
  if (!a.lastCommand) return '';
  return `${fg('$', PALETTE.dim, mode)} ${fg(a.lastCommand, PALETTE.orange, mode)}`;
}

// ---- assemble ----
function truncate(s, columns) {
  const visible = s.replace(ANSI_RE, '');
  if ([...visible].length <= columns) return s;
  return [...visible].slice(0, columns - 1).join('') + '…';
}

function main() {
  let raw = '';
  try { raw = readFileSync(0, 'utf8'); } catch { /* no stdin */ }
  const { session, cwd: stdinCwd } = parseSession(raw);
  const cwd = stdinCwd || process.env.CLAUDE_PROJECT_DIR || process.cwd();
  const nowMs = Date.now();
  const mode = colorMode(process.env);
  const columns = Number.parseInt(process.env.COLUMNS ?? '', 10) || null;

  const flow = readFlow(cwd, nowMs);
  const g = readGit(cwd);
  const activity = readActivity(cwd);

  const line1Groups = [];
  const g1 = [renderSpinnerMdd(flow, mode, nowMs), renderProgress(flow, mode), renderFlow(flow, mode)].filter(Boolean).join(' ');
  if (g1) line1Groups.push(g1);
  const mc = renderModelCtx(session, mode);
  if (mc) line1Groups.push(mc);
  const q5 = renderQuota(session.quota5h, '5h', mode);
  if (q5) line1Groups.push(q5);
  const q7 = renderQuota(session.quota7d, '7d', mode);
  if (q7) line1Groups.push(q7);
  line1Groups.push(renderToolHealth(cwd, mode));

  const line2Groups = [];
  const gb = renderGitBranch(g, mode);
  if (gb) line2Groups.push(gb);
  const tool = renderTool(activity, mode);
  if (tool) line2Groups.push(tool);
  const cmd = renderCommand(activity, mode);
  if (cmd) line2Groups.push(cmd);
  const elapsed = renderElapsed(flow, mode, nowMs);
  if (elapsed) line2Groups.push(elapsed);

  const lines = [line1Groups.join(GROUP_SEP), line2Groups.join(GROUP_SEP)]
    .filter((l) => l.length > 0)
    .map((l) => (columns !== null ? truncate(l, columns) : l));
  process.stdout.write(lines.join('\n'));
}

main();
