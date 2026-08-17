export interface CorpusPlan {
  n: number
  seed: number
  missingFraction: number
  names: string[]
  missing: Set<string>
}

export interface CorpusOptions {
  seed?: number
  missingFraction?: number
}

export function planCorpus(n: number, options?: CorpusOptions): CorpusPlan

export function writeCorpus(plan: CorpusPlan, outDir: string): { srcDir: string; testDir: string }
