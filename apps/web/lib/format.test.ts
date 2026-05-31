import { describe, it, expect } from 'vitest'
import { relativeTime, isCurrentJam } from './format'

const ISO = (msAgo: number) => new Date(1_000_000_000_000 - msAgo).toISOString()
const NOW = 1_000_000_000_000

describe('relativeTime', () => {
  it('formats seconds/minutes/hours/days/weeks', () => {
    expect(relativeTime(ISO(5_000), NOW)).toBe('now')
    expect(relativeTime(ISO(90_000), NOW)).toBe('1m')
    expect(relativeTime(ISO(3 * 3600_000), NOW)).toBe('3h')
    expect(relativeTime(ISO(2 * 86_400_000), NOW)).toBe('2d')
    expect(relativeTime(ISO(10 * 86_400_000), NOW)).toBe('1w')
  })

  it('uses "now" for the whole first minute (never "0m")', () => {
    expect(relativeTime(ISO(59_000), NOW)).toBe('now')
    expect(relativeTime(ISO(60_000), NOW)).toBe('1m')
  })

  it('returns "?" for an unparseable timestamp', () => {
    expect(relativeTime('not-a-date', NOW)).toBe('?')
  })
})

describe('isCurrentJam', () => {
  it('is true within 7 days, false at/after the boundary', () => {
    expect(isCurrentJam(ISO(6 * 86_400_000), NOW)).toBe(true)
    expect(isCurrentJam(ISO(7 * 86_400_000), NOW)).toBe(false) // exactly 7d: strict <
    expect(isCurrentJam(ISO(8 * 86_400_000), NOW)).toBe(false)
  })

  it('is false for an unparseable timestamp', () => {
    expect(isCurrentJam('not-a-date', NOW)).toBe(false)
  })
})
