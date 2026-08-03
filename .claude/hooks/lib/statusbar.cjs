#!/usr/bin/env node
/**
 * Status bar feed writer. The MDD skills call this alongside every user-facing
 * step line, so the status bar (.claude/statusline.cjs) mirrors what the skill
 * says it is doing. Best-effort: never throws, never blocks a skill.
 *
 *   node .claude/hooks/lib/statusbar.cjs run-start <flow>
 *   node .claude/hooks/lib/statusbar.cjs set <flow> <index> <total> "<label>"
 *   node .claude/hooks/lib/statusbar.cjs done <flow> ["<label>"]
 *   node .claude/hooks/lib/statusbar.cjs pause
 *   node .claude/hooks/lib/statusbar.cjs run-done
 *   node .claude/hooks/lib/statusbar.cjs clear
 *
 * TWO separate concepts live in .mdd/.statusbar.json:
 *
 * DISPLAY (flow/index/total/label/status): what the bar shows, updated by
 * every `set`, free to switch between flows (a wave shows its inner build's
 * phases, that is informative, not a new run).
 *
 * RUN (runFlow/runStartTs/runDoneTs): the elapsed timer. THE RULE: any
 * user-invoked MDD run resets the timer when invoked and stops it when done,
 * period; sub-runs it executes never touch it. The wrapper/start owns the
 * timer.
 *   - `run-start <flow>`: called ONLY at the top of a USER-invoked run
 *     (skills never call it when executing inside another MDD flow). Always
 *     resets: 00:00, new owner. This is also how an abandoned/aborted run
 *     gets replaced, the user starting something new IS the reset signal.
 *   - `set`: display only. Never resets an active run, whatever flow it
 *     names (that is a sub-run). Auto-starts a run only when none is active,
 *     as a safety net for a missing run-start.
 *   - `done <flow>`: freezes the timer ONLY when <flow> is the run's owner.
 *     An inner build's `done build` inside a wave or a bug-fix is ignored
 *     entirely; the owner's own done freezes it.
 *   - `run-done`: freezes unconditionally, whoever owns the run. Used after
 *     the last wave of an unattended import-spec handoff and on BLOCKED
 *     stops, so the timer stops where the run stopped.
 *   - `pause`: the run is WAITING ON the user; the timer freezes (amber).
 *     The next `set` auto-resumes by shifting runStartTs forward by the wait,
 *     so waiting time never counts and a forgotten resume cannot strand the
 *     timer. done/run-done during a pause freeze at the pause moment.
 *   - Staleness: an active run with no write for 45 minutes is treated as
 *     dead; the next set/run-start starts fresh. Waits do not go stale: a
 *     paused run survives any length of user absence (ts is refreshed by the
 *     pause write; the stale check is skipped while paused).
 *   - The frozen (green) time stays displayed until the next run starts.
 *   - Completion line: the `done`/`run-done` call that actually freezes the
 *     run PRINTS `MDD <run> completed in <elapsed>` to stdout. The calling
 *     skill repeats that line verbatim as the last user-visible line of the
 *     run. Ignored inner dones print nothing.
 */
'use strict';

const { writeFileSync, renameSync, unlinkSync, mkdirSync, existsSync, readFileSync } = require('node:fs');
const { join, dirname } = require('node:path');

const STALE_MS = 45 * 60 * 1000;

function readPrev(path) {
  try { return JSON.parse(readFileSync(path, 'utf8')); } catch { return null; }
}

function runFields(prev, flow, now) {
  const paused = prev && typeof prev.runPausedTs === 'number';
  const active =
    prev &&
    typeof prev.runStartTs === 'number' &&
    !prev.runDoneTs &&
    typeof prev.ts === 'number' &&
    (paused || now - prev.ts <= STALE_MS);
  if (!active) {
    // No active run: this set opens one (safety net for a missing run-start).
    return { runFlow: flow, runStartTs: now, runDoneTs: null, runPausedTs: null };
  }
  if (paused) {
    // Auto-resume: shift the start forward by the wait, so user-decision time
    // never counts as run time.
    return { runFlow: prev.runFlow, runStartTs: prev.runStartTs + (now - prev.runPausedTs), runDoneTs: null, runPausedTs: null };
  }
  // A run is active: EVERY set is absorbed, whatever flow it names. Sub-runs
  // never reset the wrapper's timer; only run-start does that.
  return { runFlow: prev.runFlow, runStartTs: prev.runStartTs, runDoneTs: null, runPausedTs: null };
}

function main() {
  try {
    const cwd = process.env.CLAUDE_PROJECT_DIR || process.cwd();
    const path = join(cwd, '.mdd', '.statusbar.json');
    const [cmd, flow, index, total, ...rest] = process.argv.slice(2);
    const now = Date.now();
    const prev = readPrev(path);

    if (cmd === 'clear') {
      try { unlinkSync(path); } catch { /* already gone */ }
      return;
    }
    if (cmd === 'run-start') {
      write(path, {
        flow: flow || undefined,
        label: rest.join(' ') || undefined,
        status: 'running',
        ts: now,
        runFlow: flow,
        runStartTs: now,
        runDoneTs: null,
      });
      return;
    }
    if (cmd === 'pause') {
      if (!prev || typeof prev.runStartTs !== 'number' || prev.runDoneTs) return;
      if (typeof prev.runPausedTs === 'number') return; // already paused
      write(path, { ...prev, status: 'waiting', ts: now, runPausedTs: now });
      return;
    }
    if (cmd === 'run-done') {
      if (!prev) return;
      const end = typeof prev.runPausedTs === 'number' ? prev.runPausedTs : now;
      const doneTs = prev.runDoneTs ?? end;
      write(path, { ...prev, status: 'done', ts: now, runDoneTs: doneTs, runPausedTs: null });
      if (!prev.runDoneTs) printCompleted(prev.runFlow, doneTs - prev.runStartTs);
      return;
    }
    if (cmd === 'done') {
      const runActive = prev && typeof prev.runStartTs === 'number' && !prev.runDoneTs;
      if (runActive && flow && prev.runFlow && flow !== prev.runFlow) {
        // An inner flow finishing inside an orchestrator's run: not our timer,
        // not our display transition. Ignore entirely.
        return;
      }
      const label = index !== undefined ? [index, total, ...rest].filter(Boolean).join(' ') : (prev ? prev.label : undefined);
      write(path, {
        ...(prev || {}),
        flow: flow || (prev ? prev.flow : undefined),
        label,
        status: 'done',
        ts: now,
        runFlow: prev && prev.runFlow ? prev.runFlow : flow,
        runStartTs: prev && typeof prev.runStartTs === 'number' ? prev.runStartTs : now,
        runDoneTs: prev && typeof prev.runPausedTs === 'number' ? prev.runPausedTs : now,
        runPausedTs: null,
      });
      if (prev && typeof prev.runStartTs === 'number' && !prev.runDoneTs) {
        const doneTs = typeof prev.runPausedTs === 'number' ? prev.runPausedTs : now;
        printCompleted(prev.runFlow || flow, doneTs - prev.runStartTs);
      }
      return;
    }
    if (cmd === 'set') {
      const run = runFields(prev, flow, now);
      write(path, {
        flow: flow || undefined,
        index: toNum(index),
        total: toNum(total),
        label: rest.join(' ') || undefined,
        status: 'running',
        ts: now,
        ...run,
      });
      return;
    }
    // Unknown command: ignore, never fail the caller.
  } catch { /* best-effort */ }
}

// The run's closing line, printed exactly once per run, when it freezes. The
// calling skill repeats it verbatim as the last user-visible line.
function printCompleted(flow, ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const sec = total % 60;
  const pad = (n) => String(n).padStart(2, '0');
  const t = h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${pad(m)}:${pad(sec)}`;
  try { process.stdout.write(`MDD ${flow || 'run'} completed in ${t}\n`); } catch { /* best-effort */ }
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
