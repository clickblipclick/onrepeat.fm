import { describe, it, expect } from 'vitest'
import { createSpotifyClient, mapSpotifyTrack, extractSpotifyTrackId } from './spotify'

const apiTrack = {
  id: 'abc',
  name: 'Thinkin Bout You',
  duration_ms: 200000,
  external_urls: { spotify: 'https://open.spotify.com/track/abc' },
  external_ids: { isrc: 'USXXX1234567' },
  artists: [{ name: 'Frank Ocean' }],
  album: { images: [{ url: 'https://img/a.jpg' }] },
}

describe('mapSpotifyTrack', () => {
  it('maps an API track to the normalized shape', () => {
    expect(mapSpotifyTrack(apiTrack)).toEqual({
      id: 'abc',
      url: 'https://open.spotify.com/track/abc',
      isrc: 'USXXX1234567',
      title: 'Thinkin Bout You',
      artist: 'Frank Ocean',
      durationMs: 200000,
      artworkUrl: 'https://img/a.jpg',
    })
  })
})

describe('extractSpotifyTrackId', () => {
  it('pulls the id after a /track/ segment (incl. locale prefixes)', () => {
    expect(extractSpotifyTrackId('https://open.spotify.com/track/abc')).toBe('abc')
    expect(extractSpotifyTrackId('https://open.spotify.com/intl-de/track/xyz?si=1')).toBe('xyz')
    expect(extractSpotifyTrackId('https://open.spotify.com/album/abc')).toBeNull()
  })
})

describe('createSpotifyClient', () => {
  function fakeFetch(calls: { url: string }[]) {
    return async (url: string, init?: any) => {
      calls.push({ url })
      if (url.includes('accounts.spotify.com')) {
        return { ok: true, status: 200, async json() { return { access_token: 'tok', expires_in: 3600 } } }
      }
      if (url.includes('/search')) {
        return { ok: true, status: 200, async json() { return { tracks: { items: [apiTrack] } } } }
      }
      if (url.includes('/tracks/')) {
        return { ok: true, status: 200, async json() { return apiTrack } }
      }
      return { ok: false, status: 404, async json() { return {} } }
    }
  }

  it('fetches a token once and reuses it across calls', async () => {
    const calls: { url: string }[] = []
    const c = createSpotifyClient({ clientId: 'id', clientSecret: 'sec', fetchFn: fakeFetch(calls), now: () => 0 })
    await c.searchTrack('frank ocean thinkin bout you')
    await c.lookupTrack('abc')
    const tokenCalls = calls.filter((x) => x.url.includes('accounts.spotify.com'))
    expect(tokenCalls).toHaveLength(1)
  })

  it('search returns mapped tracks', async () => {
    const c = createSpotifyClient({ clientId: 'id', clientSecret: 'sec', fetchFn: fakeFetch([]), now: () => 0 })
    const r = await c.searchTrack('x y')
    expect(r[0]?.isrc).toBe('USXXX1234567')
  })

  it('lookupTrack returns a mapped track', async () => {
    const c = createSpotifyClient({ clientId: 'id', clientSecret: 'sec', fetchFn: fakeFetch([]), now: () => 0 })
    expect((await c.lookupTrack('abc'))?.title).toBe('Thinkin Bout You')
  })
})
