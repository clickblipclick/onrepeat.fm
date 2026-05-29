import { describe, it, expect } from 'vitest'
import { providerTier, providerFromUrl } from './providers'

describe('providerTier', () => {
  it('classifies Odesli-graph providers as cross-resolvable', () => {
    expect(providerTier('spotify')).toBe('cross-resolvable')
    expect(providerTier('soundcloud')).toBe('cross-resolvable')
    expect(providerTier('applemusic')).toBe('cross-resolvable')
  })

  it('classifies bandcamp as self-contained', () => {
    expect(providerTier('bandcamp')).toBe('self-contained')
    expect(providerTier('BandCamp')).toBe('self-contained')
  })

  it('defaults unknown providers to cross-resolvable (Odesli may still match)', () => {
    expect(providerTier('napster')).toBe('cross-resolvable')
  })
})

describe('providerFromUrl', () => {
  it('detects providers from known hosts', () => {
    expect(providerFromUrl('https://open.spotify.com/track/abc')).toBe('spotify')
    expect(providerFromUrl('https://music.apple.com/us/album/x/1?i=2')).toBe('applemusic')
    expect(providerFromUrl('https://music.youtube.com/watch?v=x')).toBe('youtubemusic')
    expect(providerFromUrl('https://www.youtube.com/watch?v=x')).toBe('youtube')
    expect(providerFromUrl('https://youtu.be/x')).toBe('youtube')
    expect(providerFromUrl('https://artist.bandcamp.com/track/x')).toBe('bandcamp')
    expect(providerFromUrl('https://soundcloud.com/a/b')).toBe('soundcloud')
  })

  it('returns null for unknown or invalid URLs', () => {
    expect(providerFromUrl('https://example.com/x')).toBeNull()
    expect(providerFromUrl('not a url')).toBeNull()
  })
})
