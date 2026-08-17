# Measurement harness

Phase 1 / 1b only (pure tokenization plus single model calls; phase 2, the
live agent loop, is out of scope, see the delivery report). Recovered and
rebuilt into the repo after a prior session's scripts were left in a
session scratchpad, unreachable from a fresh checkout.

## Laws

Carried from the original delivery report, unchanged:

- Counters over clocks.
- Anything under 2x must reproduce across three separate invocations or
  it is withdrawn, not widened.
- A correctness gate runs before any comparison. `class2-coverage-map.mjs`
  verifies the render's computed gap against the corpus generator's own
  planted missing set at every size, and refuses to print a token table
  if it does not match exactly.
- Publish the losses. `class2-coverage-map.mjs` prints a plain verdict
  (BEATS/TIES, lands NEAR, or LOSES) against the hand-optimal arm at
  every size, not just the ones that favor the render.
- Every entry appears even when it did not run.
- Nothing from a smoke run enters a report.

## Setup

```sh
npm install   # once, pulls in js-tiktoken as a devDependency
npm run build # dist/cli/cli.js must exist; the harness shells out to it
```

## Running

```sh
node benchmarks/class3-import-graph.mjs
node benchmarks/class2-coverage-map.mjs            # default sizes: 5 50 500 5000
node benchmarks/class2-coverage-map.mjs 5 50        # or pick your own sizes
```

Both scripts are self-contained: no network access, no API keys, no
external services. The synthetic corpus (`lib/corpus.mjs`) is seeded
(default 42) and deterministic: the same seed produces the same corpus
every run, on any machine. It is its own generator, not a port of the
original session's Python `random.seed(42)` run, the exact missing-file
SET differs (a different PRNG algorithm produces a different sequence
from the same seed number), but this generator's own output is stable
run to run, which is the property that actually matters for
reproducibility going forward.

## What's here

- `lib/tokens.mjs`, cl100k_base token counting via
  [js-tiktoken](https://github.com/dqbd/tiktoken) (a pure-JS port, no
  native build step, no Python dependency).
- `lib/corpus.mjs`, the Class 2 synthetic corpus generator: N source
  files, ~20% missing a matching test, seeded and deterministic
  (mulberry32, a small well-known PRNG, not cryptographic and not
  trying to be).
- `class3-import-graph.mjs`, measures A1 (read every file), A2 (grep
  the import lines), B (one Read of the `@import-graph` render), and C
  (the render with teaching prose stripped) against this repo's own real
  `src/` tree. Re-derives and checks its own reference ratio before
  printing anything else; see the script's own comment for why the
  original 2.62x reference is stale (the example it was measured against
  no longer exists) and what replaced it.
- `class2-coverage-map.mjs`, sweeps the synthetic corpus at four sizes
  and measures A (raw `find` listing), B (the shipped, annotated
  `test-coverage-map.stage`), B-terse (the same render with teaching
  prose stripped), B-side-by-side (the old, non-reducing version, kept
  for contrast), and D (a hand-optimal Node set-difference, the
  "skeptic's arm").

## What's not here

- **Phase 1b's model-diffing trials** (give a model raw material, diff
  its answer against ground truth) need a live model call, which can't
  be a deterministic npm script the way phase 1 can. The delivery
  report documents the exact prompts used and the results; re-running
  them means repeating that prompt against a model and diffing the
  output the same way (`benchmarks/class3-import-graph.mjs`'s node/edge
  extraction logic is reusable for that diff, see its `armB` function
  for the extraction pattern).
- **Phase 2** (does an agent left alone pick the raw-shell arm or the
  hand-optimal arm) needs a real agent loop. Explicitly out of scope.
