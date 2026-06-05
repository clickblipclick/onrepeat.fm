import { describe, it, expect } from 'vitest'
import { buildEmbed, embeddableProviders, resolvePreferredKey } from './embed'
import type { ProviderRefs } from '@onrepeat/db'

const refs: ProviderRefs = {
  spotify: { url: 'https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC' },
  youtube: { url: 'https://www.youtube.com/watch?v=u9Dg-g7t2l4' },
  bandcamp: { url: 'https://artist.bandcamp.com/track/song' },
}

describe('buildEmbed', () => {
  it('prefers the source provider when embeddable', () => {
    const e = buildEmbed(
      'spotify',
      refs,
      'https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC',
    )
    expect(e).toEqual({
      kind: 'iframe',
      provider: 'spotify',
      src: 'https://open.spotify.com/embed/track/4uLU6hMCjMI75M1A2tKUQC',
      title: 'Spotify player',
    })
  })

  it('builds a YouTube embed from a watch url', () => {
    const e = buildEmbed(
      'youtube',
      { youtube: refs.youtube! },
      refs.youtube!.url,
    )
    expect(e).toEqual({
      kind: 'iframe',
      provider: 'youtube',
      src: 'https://www.youtube.com/embed/u9Dg-g7t2l4',
      title: 'YouTube player',
    })
  })

  it('falls back to the first embeddable ref when the source provider has none', () => {
    const e = buildEmbed(
      'tidal',
      { spotify: refs.spotify! },
      'https://tidal.com/track/1',
    )
    expect(e.kind).toBe('iframe')
    expect(e.provider).toBe('spotify')
  })

  it('treats bandcamp as a link-out (self-contained, no cross embed here)', () => {
    const e = buildEmbed(
      'bandcamp',
      { bandcamp: refs.bandcamp! },
      refs.bandcamp!.url,
    )
    expect(e).toEqual({
      kind: 'link',
      provider: 'bandcamp',
      href: refs.bandcamp!.url,
    })
  })

  it('returns a link-out when nothing is embeddable', () => {
    const e = buildEmbed('vinyl', {}, 'https://example.com/song')
    expect(e).toEqual({
      kind: 'link',
      provider: 'vinyl',
      href: 'https://example.com/song',
    })
  })

  it('lists the embeddable providers among the refs (for the switcher)', () => {
    expect(embeddableProviders(refs)).toEqual(['spotify', 'youtube'])
  })

  it('builds a YouTube embed from a youtu.be short link', () => {
    const e = buildEmbed(
      'youtube',
      { youtube: { url: 'https://youtu.be/abc123' } },
      'https://youtu.be/abc123',
    )
    expect(e).toEqual({
      kind: 'iframe',
      provider: 'youtube',
      src: 'https://www.youtube.com/embed/abc123',
      title: 'YouTube player',
    })
  })

  it('builds a Spotify embed from a locale-prefixed url', () => {
    const url = 'https://open.spotify.com/intl-de/track/4uLU6hMCjMI75M1A2tKUQC'
    const e = buildEmbed('spotify', { spotify: { url } }, url)
    expect(e).toEqual({
      kind: 'iframe',
      provider: 'spotify',
      src: 'https://open.spotify.com/embed/track/4uLU6hMCjMI75M1A2tKUQC',
      title: 'Spotify player',
    })
  })

  it('builds an Apple Music embed preserving the ?i= song param', () => {
    const url = 'https://music.apple.com/us/album/song/123?i=456'
    const e = buildEmbed('applemusic', { applemusic: { url } }, url)
    expect(e).toEqual({
      kind: 'iframe',
      provider: 'applemusic',
      src: 'https://embed.music.apple.com/us/album/song/123?i=456',
      title: 'Apple Music player',
    })
  })

  it('builds a SoundCloud embed by url-encoding the track url', () => {
    const url = 'https://soundcloud.com/artist/track'
    const e = buildEmbed('soundcloud', { soundcloud: { url } }, url)
    expect(e).toEqual({
      kind: 'iframe',
      provider: 'soundcloud',
      src: `https://w.soundcloud.com/player/?url=${encodeURIComponent(url)}`,
      title: 'SoundCloud player',
    })
  })

  it('guards a non-http source url in the link-out', () => {
    const e = buildEmbed('unknown', {}, 'javascript:alert(1)')
    expect(e).toEqual({ kind: 'link', provider: 'unknown', href: '#' })
  })

  it('builds a Bandcamp embed from the stored trackId', () => {
    const refs: ProviderRefs = {
      bandcamp: {
        url: 'https://x.bandcamp.com/track/y',
        trackId: '1234567890',
      },
    }
    const e = buildEmbed('bandcamp', refs, 'https://x.bandcamp.com/track/y')
    expect(e.kind).toBe('iframe')
    expect(e.provider).toBe('bandcamp')
    if (e.kind === 'iframe') {
      expect(e.src).toContain('bandcamp.com/EmbeddedPlayer/track=1234567890')
      expect(e.src).toContain('artwork=small') // compact ~120px player, consistent with the other bars
    }
  })
  it('bandcamp without a trackId is not embeddable (link-out)', () => {
    const e = buildEmbed(
      'bandcamp',
      { bandcamp: { url: 'https://x.bandcamp.com/track/y' } },
      'https://x.bandcamp.com/track/y',
    )
    expect(e.kind).toBe('link')
  })

  it('treats a youtube ref flagged embeddable:false as non-embeddable (link-out)', () => {
    const url = 'https://www.youtube.com/watch?v=x'
    const e = buildEmbed(
      'youtube',
      { youtube: { url, embeddable: false } },
      url,
    )
    expect(e.kind).toBe('link')
  })

  it('falls back to another provider when the youtube source is not embeddable', () => {
    const r: ProviderRefs = {
      youtube: { url: 'https://www.youtube.com/watch?v=x', embeddable: false },
      spotify: refs.spotify!,
    }
    const e = buildEmbed('youtube', r, 'https://www.youtube.com/watch?v=x')
    expect(e.kind).toBe('iframe')
    expect(e.provider).toBe('spotify')
  })

  it('excludes a non-embeddable youtube ref from the switcher list', () => {
    expect(
      embeddableProviders({
        youtube: { url: refs.youtube!.url, embeddable: false },
        spotify: refs.spotify!,
      }),
    ).toEqual(['spotify'])
  })
})

describe('buildEmbed with a preferred provider', () => {
  const multi: ProviderRefs = {
    spotify: refs.spotify!,
    youtube: refs.youtube!,
    soundcloud: { url: 'https://soundcloud.com/artist/track' },
  }

  it('elevates the preferred provider above the source provider', () => {
    const e = buildEmbed('spotify', multi, refs.spotify!.url, 'youtube')
    expect(e.kind).toBe('iframe')
    expect(e.provider).toBe('youtube')
  })

  it('ignores a preferred provider not present in this jam, keeping the source', () => {
    const e = buildEmbed(
      'spotify',
      { spotify: refs.spotify! },
      refs.spotify!.url,
      'soundcloud',
    )
    expect(e.provider).toBe('spotify')
  })

  it('honors a youtube preference via a youtubemusic-only ref (alias)', () => {
    const ytm: ProviderRefs = {
      spotify: refs.spotify!,
      youtubemusic: refs.youtube!,
    }
    const e = buildEmbed('spotify', ytm, refs.spotify!.url, 'youtube')
    expect(e.kind).toBe('iframe')
    expect(e.provider).toBe('youtubemusic')
  })

  it('prefers a real youtube ref over youtubemusic when both exist', () => {
    const both: ProviderRefs = {
      youtube: refs.youtube!,
      youtubemusic: { url: 'https://music.youtube.com/watch?v=zzz' },
    }
    const e = buildEmbed('spotify', both, refs.spotify!.url, 'youtube')
    expect(e.provider).toBe('youtube')
  })

  it('ignores a junk / non-embeddable preferred value', () => {
    const e = buildEmbed('spotify', multi, refs.spotify!.url, 'tidal')
    expect(e.provider).toBe('spotify')
  })

  it('is identical to the 3-arg call when preferred is undefined', () => {
    expect(buildEmbed('spotify', multi, refs.spotify!.url, undefined)).toEqual(
      buildEmbed('spotify', multi, refs.spotify!.url),
    )
  })
})

describe('resolvePreferredKey', () => {
  it('returns the key when present and embeddable', () => {
    expect(resolvePreferredKey('spotify', { spotify: refs.spotify! })).toBe(
      'spotify',
    )
  })

  it('aliases youtube <-> youtubemusic', () => {
    expect(
      resolvePreferredKey('youtube', { youtubemusic: refs.youtube! }),
    ).toBe('youtubemusic')
    expect(
      resolvePreferredKey('youtubemusic', { youtube: refs.youtube! }),
    ).toBe('youtube')
  })

  it('does not resolve a youtube preference to a non-embeddable ref', () => {
    expect(
      resolvePreferredKey('youtube', {
        youtube: { url: refs.youtube!.url, embeddable: false },
      }),
    ).toBeNull()
  })

  it('returns null for absent, junk, non-embeddable, or empty preferences', () => {
    expect(
      resolvePreferredKey('soundcloud', { spotify: refs.spotify! }),
    ).toBeNull()
    expect(resolvePreferredKey('tidal', refs)).toBeNull()
    expect(resolvePreferredKey(null, refs)).toBeNull()
    expect(resolvePreferredKey(undefined, refs)).toBeNull()
  })

  it('resolves bandcamp only with a trackId', () => {
    expect(
      resolvePreferredKey('bandcamp', {
        bandcamp: { url: 'https://x.bandcamp.com/track/y', trackId: '1' },
      }),
    ).toBe('bandcamp')
    expect(
      resolvePreferredKey('bandcamp', {
        bandcamp: { url: 'https://x.bandcamp.com/track/y' },
      }),
    ).toBeNull()
  })
})
