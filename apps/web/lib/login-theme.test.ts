import { describe, expect, it } from 'vitest'

import { THEMES } from '@onrepeat/core'

import { pickLoginTheme } from './login-theme'

describe('pickLoginTheme', () => {
  it('returns the first theme when rand is 0', () => {
    expect(pickLoginTheme(() => 0)).toBe(THEMES[0])
  })

  it('returns the last theme when rand is just under 1', () => {
    expect(pickLoginTheme(() => 0.999)).toBe(THEMES[THEMES.length - 1])
  })

  it('always returns a valid theme across the rand range', () => {
    for (let i = 0; i < 20; i++) {
      expect(THEMES).toContain(pickLoginTheme(() => i / 20))
    }
  })

  it('defaults to Math.random (returns a valid theme with no arg)', () => {
    expect(THEMES).toContain(pickLoginTheme())
  })
})
