import { describe, it, expect } from 'vitest'
import { resolveTrack, type ResolveDeps } from './resolve-track'
import type { SpotifyTrack } from './spotify'

const spTrack: SpotifyTrack = {
  id: 'sp1', url: 'https://open.spotify.com/track/sp1', isrc: 'USX', title: 'Thinkin Bout You',
  artist: 'Frank Ocean', durationMs: 200000, artworkUrl: 'https://img/a.jpg',
}
const ytVid = { videoId: 'yt1', url: 'https://www.youtube.com/watch?v=yt1', title: 'Frank Ocean - Thinkin Bout You', channelTitle: 'Chan' }

function deps(over: Partial<ResolveDeps> = {}): ResolveDeps {
  return {
    spotify: { async searchTrack() { return [spTrack] }, async lookupTrack() { return spTrack } },
    youtube: { async searchVideo() { return [ytVid] }, async lookupDurations() { return new Map([['yt1', 201]]) } },
    ...over,
  }
}

const base = { sourceUrl: 'https://music.apple.com/us/album/t/1?i=2', sourceProvider: 'applemusic', title: 'Thinkin Bout You', artist: 'Frank Ocean' }

describe('resolveTrack', () => {
  it('keeps the source ref and adds confident spotify + youtube links + isrc + canonical metadata', async () => {
    const r = await resolveTrack(base, deps())
    expect(r.providerRefs.applemusic).toEqual({ url: base.sourceUrl })
    expect(r.providerRefs.spotify).toEqual({ url: 'https://open.spotify.com/track/sp1' })
    expect(r.providerRefs.youtube).toEqual({ url: 'https://www.youtube.com/watch?v=yt1' })
    expect(r.isrc).toBe('USX')
    expect(r.title).toBe('Thinkin Bout You')
    expect(r.artworkUrl).toBe('https://img/a.jpg')
  })

  it('uses Spotify lookup (not search) when the source IS spotify', async () => {
    let searched = false
    const r = await resolveTrack(
      { ...base, sourceUrl: 'https://open.spotify.com/track/sp1', sourceProvider: 'spotify' },
      deps({ spotify: { async searchTrack() { searched = true; return [] }, async lookupTrack() { return spTrack } } }),
    )
    expect(searched).toBe(false)
    expect(r.providerRefs.spotify).toEqual({ url: 'https://open.spotify.com/track/sp1' })
  })

  it('omits spotify when no confident match is found', async () => {
    const r = await resolveTrack(base, deps({ spotify: { async searchTrack() { return [{ ...spTrack, title: 'Totally Different Song', artist: 'Nobody', durationMs: 99000 }] }, async lookupTrack() { return null } } }))
    expect(r.providerRefs.spotify).toBeUndefined()
  })

  it('omits youtube when the duration disagrees', async () => {
    const r = await resolveTrack(base, deps({ youtube: { async searchVideo() { return [ytVid] }, async lookupDurations() { return new Map([['yt1', 320]]) } } }))
    expect(r.providerRefs.youtube).toBeUndefined()
  })

  it('skips a provider whose client is absent or throws, still returning the source ref', async () => {
    const r = await resolveTrack(base, { spotify: { async searchTrack() { throw new Error('boom') }, async lookupTrack() { throw new Error('boom') } } })
    expect(r.providerRefs).toEqual({ applemusic: { url: base.sourceUrl } })
  })
})
