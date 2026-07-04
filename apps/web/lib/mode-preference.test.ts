import { describe, expect, it } from 'vitest'

import {
  MODE_PREF_COOKIE,
  MODE_PREF_MAX_AGE,
  modeCookieString,
  parseMode,
  PINNED_MODES,
} from './mode-preference'

describe('parseMode', () => {
  it('accepts each pinned mode', () => {
    for (const m of PINNED_MODES) expect(parseMode(m)).toBe(m)
  })

  it('is case-insensitive and trims whitespace', () => {
    expect(parseMode('  DARK ')).toBe('dark')
    expect(parseMode('Light')).toBe('light')
  })

  it('rejects unknown, empty, and nullish values (→ system)', () => {
    // 'system' is represented by cookie absence, so even the literal string is invalid
    expect(parseMode('system')).toBeNull()
    expect(parseMode('auto')).toBeNull()
    expect(parseMode('<script>')).toBeNull()
    expect(parseMode('')).toBeNull()
    expect(parseMode(undefined)).toBeNull()
    expect(parseMode(null)).toBeNull()
  })
})

describe('modeCookieString', () => {
  it('serializes a pinned mode with the expected attributes', () => {
    const s = modeCookieString('dark', false)
    expect(s).toContain(`${MODE_PREF_COOKIE}=dark`)
    expect(s).toContain('Path=/')
    expect(s).toContain(`Max-Age=${MODE_PREF_MAX_AGE}`)
    expect(s).toContain('SameSite=Lax')
    expect(s).not.toContain('Secure')
  })

  it('serializes a deletion when mode is null (back to system)', () => {
    const s = modeCookieString(null, false)
    expect(s).toContain(`${MODE_PREF_COOKIE}=;`)
    expect(s).toContain('Max-Age=0')
    expect(s).toContain('Path=/')
  })

  it('adds Secure when requested', () => {
    expect(modeCookieString('light', true)).toContain('Secure')
    expect(modeCookieString(null, true)).toContain('Secure')
  })

  it('round-trips through parseMode', () => {
    const value = modeCookieString('light', false).split('; ')[0]?.split('=')[1]
    expect(parseMode(value)).toBe('light')
  })
})
