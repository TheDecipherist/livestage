import { describe, it, expect } from 'vitest'
import { subtract } from '../src/subtract.js'

describe('subtract', () => {
  it('subtracts two numbers', () => {
    expect(subtract(5, 3)).toBe(2)
  })
})
