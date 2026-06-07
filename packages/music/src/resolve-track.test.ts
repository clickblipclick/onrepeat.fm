import { describe, it, expect } from 'vitest'
import { resolveTrack, type ResolveDeps } from './resolve-track'
import type { TrackCandidate } from './track'

const apple: TrackCandidate = {
  title: 'Thinkin Bout You',
  artist: 'Frank Ocean',
  artworkUrl: 'https://img/a.jpg',
  sourceUrl: 'https://music.apple.com/us/album/t/1?i=2',
  provider: 'applemusic',
  durationSec: 200,
}
const ytVid = {
  videoId: 'yt1',
  url: 'https://www.youtube.com/watch?v=yt1',
  title: 'Frank Ocean - Thinkin Bout You',
  channelTitle: 'Chan',
}

function deps(over: Partial<ResolveDeps> = {}): ResolveDeps {
  return {
    itunes: {
      async search() {
        return [apple]
      },
      async lookup() {
        return apple
      },
    },
    youtube: {
      async searchVideo() {
        return [ytVid]
      },
      async lookupVideos() {
        return new Map([['yt1', { durationSec: 201, embeddable: true }]])
      },
    },
    ...over,
  }
}
const base = {
  sourceUrl: 'https://open.spotify.com/track/sp1',
  sourceProvider: 'spotify',
  title: 'Thinkin Bout You',
  artist: 'Frank Ocean',
}

describe('resolveTrack (iTunes-anchored)', () => {
  it('keeps source ref + adds apple (iTunes) and youtube + canonical metadata', async () => {
    const r = await resolveTrack(base, deps())
    expect(r.providerRefs.spotify).toEqual({ url: base.sourceUrl })
    expect(r.providerRefs.applemusic).toEqual({
      url: 'https://music.apple.com/us/album/t/1?i=2',
    })
    expect(r.providerRefs.youtube).toEqual({
      url: 'https://www.youtube.com/watch?v=yt1',
    })
    expect(r.title).toBe('Thinkin Bout You')
    expect(r.artworkUrl).toBe('https://img/a.jpg')
    expect(r.notes).toEqual(['apple:matched', 'youtube:matched'])
  })

  it('notes youtube:skipped(no-key) when there is no youtube client', async () => {
    const r = await resolveTrack(base, { itunes: deps().itunes })
    expect(r.notes).toContain('apple:matched')
    expect(r.notes).toContain('youtube:skipped(no-key)')
  })

  it('notes youtube:no-match when no confident video', async () => {
    const r = await resolveTrack(
      base,
      deps({
        youtube: {
          async searchVideo() {
            return [ytVid]
          },
          async lookupVideos() {
            return new Map([['yt1', { durationSec: 999, embeddable: true }]])
          },
        },
      }),
    )
    expect(r.providerRefs.youtube).toBeUndefined()
    expect(r.notes).toContain('youtube:no-match')
  })

  it('apple source: uses lookup (not search), no separate apple cross-link beyond source', async () => {
    let searched = false
    const r = await resolveTrack(
      {
        ...base,
        sourceUrl: 'https://music.apple.com/us/album/t/1?i=2',
        sourceProvider: 'applemusic',
      },
      deps({
        itunes: {
          async search() {
            searched = true
            return []
          },
          async lookup() {
            return apple
          },
        },
      }),
    )
    expect(searched).toBe(false)
    expect(r.providerRefs.applemusic).toEqual({
      url: 'https://music.apple.com/us/album/t/1?i=2',
    })
  })

  it('omits apple when no confident iTunes match', async () => {
    const r = await resolveTrack(
      base,
      deps({
        itunes: {
          async search() {
            return [
              {
                ...apple,
                title: 'Totally Different',
                artist: 'Nobody',
                durationSec: 99,
              },
            ]
          },
          async lookup() {
            return null
          },
        },
      }),
    )
    expect(r.providerRefs.applemusic).toBeUndefined()
  })

  it('omits youtube when duration disagrees', async () => {
    const r = await resolveTrack(
      base,
      deps({
        youtube: {
          async searchVideo() {
            return [ytVid]
          },
          async lookupVideos() {
            return new Map([['yt1', { durationSec: 320, embeddable: true }]])
          },
        },
      }),
    )
    expect(r.providerRefs.youtube).toBeUndefined()
  })

  it('omits the youtube cross-link when the matched video is not embeddable', async () => {
    const r = await resolveTrack(
      base,
      deps({
        youtube: {
          async searchVideo() {
            return [ytVid]
          },
          async lookupVideos() {
            return new Map([['yt1', { durationSec: 201, embeddable: false }]])
          },
        },
      }),
    )
    expect(r.providerRefs.youtube).toBeUndefined()
  })

  it('skips a throwing/absent provider, still returns source ref', async () => {
    const r = await resolveTrack(base, {
      itunes: {
        async search() {
          throw new Error('x')
        },
        async lookup() {
          throw new Error('x')
        },
      },
    })
    expect(r.providerRefs).toEqual({ spotify: { url: base.sourceUrl } })
  })

  it('youtubemusic source: keeps the source ref, adds no duplicate youtube cross-link', async () => {
    let searched = false
    const r = await resolveTrack(
      {
        ...base,
        sourceUrl: 'https://music.youtube.com/watch?v=ytm1',
        sourceProvider: 'youtubemusic',
      },
      deps({
        youtube: {
          async searchVideo() {
            searched = true
            return [ytVid]
          },
          async lookupVideos() {
            return new Map([['ytm1', { embeddable: true }]])
          },
        },
      }),
    )
    expect(searched).toBe(false)
    expect(r.providerRefs.youtubemusic).toEqual({
      url: 'https://music.youtube.com/watch?v=ytm1',
    })
    expect(r.providerRefs.youtube).toBeUndefined()
  })

  it('youtube source: keeps the pasted video, never overwrites it with a search hit', async () => {
    const r = await resolveTrack(
      {
        ...base,
        sourceUrl: 'https://www.youtube.com/watch?v=mine',
        sourceProvider: 'youtube',
      },
      deps({
        youtube: {
          async searchVideo() {
            return [ytVid]
          },
          async lookupVideos() {
            return new Map([['mine', { embeddable: true }]])
          },
        },
      }),
    )
    expect(r.providerRefs.youtube).toEqual({
      url: 'https://www.youtube.com/watch?v=mine',
    })
  })

  it('flags a non-embeddable youtube source ref so the player can fall back', async () => {
    const r = await resolveTrack(
      {
        ...base,
        sourceUrl: 'https://www.youtube.com/watch?v=mine',
        sourceProvider: 'youtube',
      },
      deps({
        youtube: {
          async searchVideo() {
            return []
          },
          async lookupVideos() {
            return new Map([['mine', { embeddable: false }]])
          },
        },
      }),
    )
    expect(r.providerRefs.youtube).toEqual({
      url: 'https://www.youtube.com/watch?v=mine',
      embeddable: false,
    })
  })
})
