import type { AssertResult } from './operators.js'

// Rendered inline where the @assert directive sat, so a rendered assertion
// doc reads as a pass/fail report on its own (the "goes green" demo-state).
export function formatAssertResult(result: AssertResult): string {
  const mark = result.passed ? '✓' : '✗'
  const status = result.passed ? 'PASS' : 'FAIL'
  const vacuousNote = result.vacuous ? ' (vacuous)' : ''
  return `${mark} ${result.operator} ${result.target}: ${status}${vacuousNote} (${result.matches} match${result.matches === 1 ? '' : 'es'})`
}

export interface AssertSummary {
  total: number
  passed: number
  failed: number
  vacuousPasses: number
  allPassed: boolean
}

export function summarizeAssertResults(results: AssertResult[]): AssertSummary {
  const passed = results.filter(r => r.passed).length
  const vacuousPasses = results.filter(r => r.passed && r.vacuous).length
  return {
    total: results.length,
    passed,
    failed: results.length - passed,
    vacuousPasses,
    allPassed: results.length > 0 && passed === results.length,
  }
}
