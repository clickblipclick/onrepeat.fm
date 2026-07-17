import { describe, expect, it } from 'vitest'

import type { ThemeName } from '@onrepeat/core'

import {
  blueskyComposeUrl,
  buildJamOgMeta,
  buildShareText,
  themeAccent,
  titleFontSize,
} from './share'

describe('themeAccent', () => {
  it('maps each known theme to its light accent hex', () => {
    expect(themeAccent('clay')).toBe('#b64c27')
    expect(themeAccent('court-green')).toBe('#2f7d4f')
    expect(themeAccent('ink-cobalt')).toBe('#2b5bd7')
    expect(themeAccent('marigold')).toBe('#966309')
    expect(themeAccent('plum')).toBe('#7c4aa6')
    expect(themeAccent('teal')).toBe('#0f766e')
  })
  it('falls back to neutral for missing/unknown', () => {
    expect(themeAccent(undefined)).toBe('#1a1a1c')
    expect(themeAccent('unknown-theme' as ThemeName)).toBe('#1a1a1c')
  })
})

describe('titleFontSize', () => {
  it('steps down as the title gets longer', () => {
    expect(titleFontSize('Short')).toBe(64)
    expect(titleFontSize('A medium length song title here ok')).toBe(48) // 34 chars
    expect(titleFontSize('x'.repeat(60))).toBe(38)
    expect(titleFontSize('x'.repeat(18))).toBe(64)
    expect(titleFontSize('x'.repeat(19))).toBe(48)
    expect(titleFontSize('x'.repeat(40))).toBe(48)
    expect(titleFontSize('x'.repeat(41))).toBe(38)
  })
})

describe('buildShareText', () => {
  it('builds compose text with the link on its own line', () => {
    const text = buildShareText({
      title: 'Such Great Heights',
      artist: 'The Postal Service',
      url: 'https://onrepeat.fm/profile/ben/jam/abc',
    })
    expect(text).toBe(
      '🔁 Such Great Heights — The Postal Service\nhttps://onrepeat.fm/profile/ben/jam/abc',
    )
  })
})

describe('blueskyComposeUrl', () => {
  it('URL-encodes the text into the compose intent', () => {
    const url = blueskyComposeUrl('🔁 Song — Artist\nhttps://onrepeat.fm/x')
    expect(url.startsWith('https://bsky.app/intent/compose?text=')).toBe(true)
    const parsed = new URL(url)
    expect(parsed.searchParams.get('text')).toBe(
      '🔁 Song — Artist\nhttps://onrepeat.fm/x',
    )
  })
})

describe('buildJamOgMeta', () => {
  it('builds title + description with attribution', () => {
    const m = buildJamOgMeta({
      title: 'Such Great Heights',
      artist: 'The Postal Service',
      authorLabel: 'ben',
    })
    expect(m.title).toBe(
      'Such Great Heights — The Postal Service · onrepeat.fm',
    )
    expect(m.description).toBe('ben has this on repeat right now.')
  })
})
