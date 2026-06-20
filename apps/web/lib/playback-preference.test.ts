import { describe, expect, it } from 'vitest'

import {
  parseProvider,
  PLAYBACK_PREF_COOKIE,
  PLAYBACK_PREF_MAX_AGE,
  playbackCookieString,
  VALID_PROVIDERS,
} from './playback-preference'

describe('parseProvider', () => {
  it('accepts each valid provider', () => {
    for (const p of VALID_PROVIDERS) expect(parseProvider(p)).toBe(p)
  })

  it('folds the youtubemusic alias into youtube', () => {
    expect(parseProvider('youtubemusic')).toBe('youtube')
  })

  it('is case-insensitive and trims whitespace', () => {
    expect(parseProvider('  SPOTIFY ')).toBe('spotify')
    expect(parseProvider('YouTubeMusic')).toBe('youtube')
  })

  it('rejects unknown, empty, and nullish values', () => {
    expect(parseProvider('tidal')).toBeNull()
    expect(parseProvider('bandcamp')).toBeNull()
    expect(parseProvider('<script>')).toBeNull()
    expect(parseProvider('')).toBeNull()
    expect(parseProvider(undefined)).toBeNull()
    expect(parseProvider(null)).toBeNull()
  })
})

describe('playbackCookieString', () => {
  it('serializes a parseable cookie with the expected attributes', () => {
    const s = playbackCookieString('spotify', false)
    expect(s).toContain(`${PLAYBACK_PREF_COOKIE}=spotify`)
    expect(s).toContain('Path=/')
    expect(s).toContain(`Max-Age=${PLAYBACK_PREF_MAX_AGE}`)
    expect(s).toContain('SameSite=Lax')
    expect(s).not.toContain('Secure')
  })

  it('adds Secure when requested', () => {
    expect(playbackCookieString('applemusic', true)).toContain('Secure')
  })

  it('round-trips through parseProvider', () => {
    // value segment before the first '; '
    const value = playbackCookieString('soundcloud', false)
      .split('; ')[0]
      ?.split('=')[1]
    expect(parseProvider(decodeURIComponent(value ?? ''))).toBe('soundcloud')
  })
})
