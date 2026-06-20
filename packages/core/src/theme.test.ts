import { describe, expect, it } from 'vitest'

import {
  defaultThemeForDid,
  FALLBACK_THEME,
  isThemeName,
  resolveTheme,
  THEME_LABELS,
  THEMES,
} from './theme'

describe('isThemeName', () => {
  it('accepts registered slugs and rejects everything else', () => {
    expect(isThemeName('clay')).toBe(true)
    expect(isThemeName('plum')).toBe(true)
    expect(isThemeName('nope')).toBe(false)
    expect(isThemeName('')).toBe(false)
    expect(isThemeName(undefined)).toBe(false)
    expect(isThemeName(null)).toBe(false)
    expect(isThemeName(42)).toBe(false)
  })

  it('has a label for every theme and a registered fallback', () => {
    for (const t of THEMES) expect(THEME_LABELS[t]).toBeTruthy()
    expect(isThemeName(FALLBACK_THEME)).toBe(true)
  })
})

describe('defaultThemeForDid', () => {
  it('is deterministic for a given DID', () => {
    const did = 'did:plc:abc123'
    expect(defaultThemeForDid(did)).toBe(defaultThemeForDid(did))
  })

  it('always returns a registered theme', () => {
    for (let i = 0; i < 200; i++) {
      expect(THEMES).toContain(defaultThemeForDid(`did:plc:seed${i}`))
    }
  })

  it('spreads across the registry rather than picking one theme', () => {
    const seen = new Set<string>()
    for (let i = 0; i < 200; i++)
      seen.add(defaultThemeForDid(`did:plc:user${i}`))
    expect(seen.size).toBeGreaterThan(1)
  })
})

describe('resolveTheme', () => {
  it('returns a valid stored theme as-is', () => {
    expect(resolveTheme('teal', 'did:plc:x')).toBe('teal')
  })

  it('falls back to the deterministic default for null/undefined/junk', () => {
    const did = 'did:plc:x'
    const def = defaultThemeForDid(did)
    expect(resolveTheme(null, did)).toBe(def)
    expect(resolveTheme(undefined, did)).toBe(def)
    expect(resolveTheme('not-a-theme', did)).toBe(def)
  })
})
