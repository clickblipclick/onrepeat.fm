import { describe, expect, it, vi } from 'vitest'

import {
  createItunesClient,
  lookupTrack,
  lookupTrackResult,
  mapItunes,
  searchTracks,
} from './itunes'

const fixture = {
  resultCount: 2,
  results: [
    {
      trackName: 'Teardrop',
      artistName: 'Massive Attack',
      artworkUrl100: 'https://is1.mzstatic.com/img/aaa/100x100bb.jpg',
      trackViewUrl: 'https://music.apple.com/us/album/teardrop/1?i=2',
    },
    { trackName: 'No URL', artistName: 'Nobody' },
  ],
}

describe('mapItunes', () => {
  it('maps results, upsizes artwork, drops malformed', () => {
    expect(mapItunes(fixture)).toEqual([
      {
        title: 'Teardrop',
        artist: 'Massive Attack',
        artworkUrl: 'https://is1.mzstatic.com/img/aaa/300x300bb.jpg',
        sourceUrl: 'https://music.apple.com/us/album/teardrop/1?i=2',
        provider: 'applemusic',
      },
    ])
  })
  it('handles an empty body', () => {
    expect(mapItunes({})).toEqual([])
  })
})

describe('searchTracks', () => {
  it('returns [] for queries under 2 chars without calling fetch', async () => {
    const fetchFn = vi.fn()
    expect(await searchTracks('a', { fetchFn })).toEqual([])
    expect(fetchFn).not.toHaveBeenCalled()
  })
  it('fetches the iTunes endpoint and maps the body', async () => {
    const fetchFn = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => fixture,
    }))
    const out = await searchTracks('teardrop', { fetchFn })
    expect(out).toHaveLength(1)
    expect(out[0]!.title).toBe('Teardrop')
    expect(
      (fetchFn.mock.calls[0] as unknown as [string, ...unknown[]])[0],
    ).toContain('itunes.apple.com/search')
    expect(
      (fetchFn.mock.calls[0] as unknown as [string, ...unknown[]])[0],
    ).toContain('term=teardrop')
  })
  it('url-encodes the search term', async () => {
    const fetchFn = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ results: [] }),
    }))
    await searchTracks('massive attack', { fetchFn })
    expect(
      (fetchFn.mock.calls[0] as unknown as [string, ...unknown[]])[0],
    ).toContain('term=massive%20attack')
  })
  it('throws "itunes invalid-json" on a 200 with non-JSON body', async () => {
    const fetchFn = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => {
        throw new Error('bad json')
      },
    }))
    await expect(searchTracks('teardrop', { fetchFn })).rejects.toThrow(
      'itunes invalid-json',
    )
  })
  it('throws on a non-ok response', async () => {
    const fetchFn = vi.fn(async () => ({
      ok: false,
      status: 503,
      json: async () => ({}),
    }))
    await expect(searchTracks('teardrop', { fetchFn })).rejects.toThrow(
      'itunes 503',
    )
  })
})

describe('lookupTrack', () => {
  const body = {
    resultCount: 1,
    results: [
      {
        trackName: 'T',
        artistName: 'A',
        artworkUrl100: 'https://x/100x100bb.jpg',
        trackViewUrl: 'https://music.apple.com/us/album/t/1?i=2',
      },
    ],
  }
  it('maps the first lookup result to a candidate (upsized art)', async () => {
    const fetchFn = async () => ({
      ok: true,
      status: 200,
      async json() {
        return body
      },
    })
    expect(await lookupTrack('2', { fetchFn })).toEqual({
      title: 'T',
      artist: 'A',
      artworkUrl: 'https://x/300x300bb.jpg',
      sourceUrl: 'https://music.apple.com/us/album/t/1?i=2',
      provider: 'applemusic',
    })
  })
  it('returns null on a non-OK response', async () => {
    const fetchFn = async () => ({
      ok: false,
      status: 500,
      async json() {
        return {}
      },
    })
    expect(await lookupTrack('2', { fetchFn })).toBeNull()
  })
  it('propagates a thrown network error (resolveTrack treats this as transient)', async () => {
    const fetchFn = async () => {
      throw new Error('network')
    }
    await expect(lookupTrack('2', { fetchFn })).rejects.toThrow('network')
  })
})

describe('itunes durationSec + client', () => {
  const body = {
    resultCount: 1,
    results: [
      {
        trackName: 'T',
        artistName: 'A',
        artworkUrl100: 'https://x/100x100bb.jpg',
        trackViewUrl: 'https://music.apple.com/us/album/t/1?i=2',
        trackTimeMillis: 213573,
      },
    ],
  }
  it('mapItunes includes durationSec from trackTimeMillis', async () => {
    const fetchFn = async () => ({
      ok: true,
      status: 200,
      async json() {
        return body
      },
    })
    const [c] = await searchTracks('rick astley', { fetchFn })
    expect(c?.durationSec).toBe(214)
  })
  it('createItunesClient.search/lookup return candidates', async () => {
    const fetchFn = async () => ({
      ok: true,
      status: 200,
      async json() {
        return body
      },
    })
    const client = createItunesClient({ fetchFn })
    expect((await client.search('x y'))[0]?.sourceUrl).toBe(
      'https://music.apple.com/us/album/t/1?i=2',
    )
    expect((await client.lookup('2'))?.durationSec).toBe(214)
  })

  it('with minIntervalMs, the client serializes calls (no overlapping requests)', async () => {
    let active = 0
    let maxActive = 0
    const fetchFn = async () => {
      active++
      maxActive = Math.max(maxActive, active)
      await new Promise((r) => setTimeout(r, 5))
      active--
      return {
        ok: true,
        status: 200,
        async json() {
          return { results: [] }
        },
      }
    }
    const client = createItunesClient({ fetchFn, minIntervalMs: 1 })
    await Promise.all([
      client.search('aa'),
      client.search('bb'),
      client.lookup('1'),
    ])
    expect(maxActive).toBe(1) // limiter ran them one at a time
  })

  it('the client retries a transient 503 then succeeds', async () => {
    let calls = 0
    const fetchFn = async () => {
      calls++
      return calls < 2
        ? {
            ok: false,
            status: 503,
            async json() {
              return {}
            },
          }
        : {
            ok: true,
            status: 200,
            async json() {
              return body
            },
          }
    }
    const client = createItunesClient({
      fetchFn,
      retry: {
        attempts: 3,
        baseDelayMs: 1,
        sleep: async () => {},
        jitter: () => 0,
      },
    })
    expect((await client.search('x y'))[0]?.durationSec).toBe(214)
    expect(calls).toBe(2)
  })
})

describe('lookupTrackResult', () => {
  const okBody = async () => ({
    ok: true,
    status: 200,
    async json() {
      return {
        results: [
          {
            trackName: 'T',
            artistName: 'A',
            trackViewUrl: 'https://music.apple.com/us/album/t/1?i=2',
          },
        ],
      }
    },
  })

  it('ok with the mapped candidate', async () => {
    const r = await lookupTrackResult('2', { fetchFn: okBody })
    expect(r).toMatchObject({ ok: true, data: { title: 'T', artist: 'A' } })
  })

  it('transient on 5xx', async () => {
    const fetchFn = async () => ({
      ok: false,
      status: 500,
      async json() {
        return {}
      },
    })
    expect(await lookupTrackResult('2', { fetchFn })).toEqual({
      ok: false,
      reason: 'transient',
    })
  })

  it('transient on a thrown network error', async () => {
    const fetchFn = async () => {
      throw new Error('network')
    }
    expect(await lookupTrackResult('2', { fetchFn })).toEqual({
      ok: false,
      reason: 'transient',
    })
  })

  it('unreadable on 404', async () => {
    const fetchFn = async () => ({
      ok: false,
      status: 404,
      async json() {
        return {}
      },
    })
    expect(await lookupTrackResult('2', { fetchFn })).toEqual({
      ok: false,
      reason: 'unreadable',
    })
  })

  it('unreadable on an empty result set', async () => {
    const fetchFn = async () => ({
      ok: true,
      status: 200,
      async json() {
        return { results: [] }
      },
    })
    expect(await lookupTrackResult('2', { fetchFn })).toEqual({
      ok: false,
      reason: 'unreadable',
    })
  })
})
