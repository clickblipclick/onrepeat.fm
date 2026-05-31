import { describe, it, expect } from 'vitest'
import { buildEmbed, embeddableProviders } from './embed'
import type { ProviderRefs } from '@onrepeat/db'

const refs: ProviderRefs = {
  spotify: { url: 'https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC' },
  youtube: { url: 'https://www.youtube.com/watch?v=u9Dg-g7t2l4' },
  bandcamp: { url: 'https://artist.bandcamp.com/track/song' },
}

describe('buildEmbed', () => {
  it('prefers the source provider when embeddable', () => {
    const e = buildEmbed('spotify', refs, 'https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC')
    expect(e).toEqual({ kind: 'iframe', provider: 'spotify', src: 'https://open.spotify.com/embed/track/4uLU6hMCjMI75M1A2tKUQC', title: 'Spotify player' })
  })

  it('builds a YouTube embed from a watch url', () => {
    const e = buildEmbed('youtube', { youtube: refs.youtube! }, refs.youtube!.url)
    expect(e).toEqual({ kind: 'iframe', provider: 'youtube', src: 'https://www.youtube.com/embed/u9Dg-g7t2l4', title: 'YouTube player' })
  })

  it('falls back to the first embeddable ref when the source provider has none', () => {
    const e = buildEmbed('tidal', { spotify: refs.spotify! }, 'https://tidal.com/track/1')
    expect(e.kind).toBe('iframe')
    expect(e.provider).toBe('spotify')
  })

  it('treats bandcamp as a link-out (self-contained, no cross embed here)', () => {
    const e = buildEmbed('bandcamp', { bandcamp: refs.bandcamp! }, refs.bandcamp!.url)
    expect(e).toEqual({ kind: 'link', provider: 'bandcamp', href: refs.bandcamp!.url })
  })

  it('returns a link-out when nothing is embeddable', () => {
    const e = buildEmbed('vinyl', {}, 'https://example.com/song')
    expect(e).toEqual({ kind: 'link', provider: 'vinyl', href: 'https://example.com/song' })
  })

  it('lists the embeddable providers among the refs (for the switcher)', () => {
    expect(embeddableProviders(refs)).toEqual(['spotify', 'youtube'])
  })

  it('builds a YouTube embed from a youtu.be short link', () => {
    const e = buildEmbed('youtube', { youtube: { url: 'https://youtu.be/abc123' } }, 'https://youtu.be/abc123')
    expect(e).toEqual({ kind: 'iframe', provider: 'youtube', src: 'https://www.youtube.com/embed/abc123', title: 'YouTube player' })
  })

  it('builds a Spotify embed from a locale-prefixed url', () => {
    const url = 'https://open.spotify.com/intl-de/track/4uLU6hMCjMI75M1A2tKUQC'
    const e = buildEmbed('spotify', { spotify: { url } }, url)
    expect(e).toEqual({ kind: 'iframe', provider: 'spotify', src: 'https://open.spotify.com/embed/track/4uLU6hMCjMI75M1A2tKUQC', title: 'Spotify player' })
  })

  it('builds an Apple Music embed preserving the ?i= song param', () => {
    const url = 'https://music.apple.com/us/album/song/123?i=456'
    const e = buildEmbed('applemusic', { applemusic: { url } }, url)
    expect(e).toEqual({ kind: 'iframe', provider: 'applemusic', src: 'https://embed.music.apple.com/us/album/song/123?i=456', title: 'Apple Music player' })
  })

  it('builds a SoundCloud embed by url-encoding the track url', () => {
    const url = 'https://soundcloud.com/artist/track'
    const e = buildEmbed('soundcloud', { soundcloud: { url } }, url)
    expect(e).toEqual({ kind: 'iframe', provider: 'soundcloud', src: `https://w.soundcloud.com/player/?url=${encodeURIComponent(url)}`, title: 'SoundCloud player' })
  })

  it('guards a non-http source url in the link-out', () => {
    const e = buildEmbed('unknown', {}, 'javascript:alert(1)')
    expect(e).toEqual({ kind: 'link', provider: 'unknown', href: '#' })
  })
})
