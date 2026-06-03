import { describe, it, expect, vi } from 'vitest'
import { mapItunes, searchTracks, lookupTrack } from './itunes'

const fixture = {
  resultCount: 2,
  results: [
    { trackName: 'Teardrop', artistName: 'Massive Attack', artworkUrl100: 'https://is1.mzstatic.com/img/aaa/100x100bb.jpg', trackViewUrl: 'https://music.apple.com/us/album/teardrop/1?i=2' },
    { trackName: 'No URL', artistName: 'Nobody' },
  ],
}

describe('mapItunes', () => {
  it('maps results, upsizes artwork, drops malformed', () => {
    expect(mapItunes(fixture)).toEqual([
      { title: 'Teardrop', artist: 'Massive Attack', artworkUrl: 'https://is1.mzstatic.com/img/aaa/300x300bb.jpg', sourceUrl: 'https://music.apple.com/us/album/teardrop/1?i=2', provider: 'applemusic' },
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
    const fetchFn = vi.fn(async () => ({ ok: true, status: 200, json: async () => fixture }))
    const out = await searchTracks('teardrop', { fetchFn })
    expect(out).toHaveLength(1)
    expect(out[0]!.title).toBe('Teardrop')
    expect((fetchFn.mock.calls[0] as unknown as [string, ...unknown[]])[0]).toContain('itunes.apple.com/search')
    expect((fetchFn.mock.calls[0] as unknown as [string, ...unknown[]])[0]).toContain('term=teardrop')
  })
  it('url-encodes the search term', async () => {
    const fetchFn = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ results: [] }) }))
    await searchTracks('massive attack', { fetchFn })
    expect((fetchFn.mock.calls[0] as unknown as [string, ...unknown[]])[0]).toContain('term=massive%20attack')
  })
  it('throws "itunes invalid-json" on a 200 with non-JSON body', async () => {
    const fetchFn = vi.fn(async () => ({ ok: true, status: 200, json: async () => { throw new Error('bad json') } }))
    await expect(searchTracks('teardrop', { fetchFn })).rejects.toThrow('itunes invalid-json')
  })
  it('throws on a non-ok response', async () => {
    const fetchFn = vi.fn(async () => ({ ok: false, status: 503, json: async () => ({}) }))
    await expect(searchTracks('teardrop', { fetchFn })).rejects.toThrow('itunes 503')
  })
})

describe('lookupTrack', () => {
  const body = { resultCount: 1, results: [{ trackName: 'T', artistName: 'A', artworkUrl100: 'https://x/100x100bb.jpg', trackViewUrl: 'https://music.apple.com/us/album/t/1?i=2' }] }
  it('maps the first lookup result to a candidate (upsized art)', async () => {
    const fetchFn = async () => ({ ok: true, status: 200, async json() { return body } })
    expect(await lookupTrack('2', { fetchFn })).toEqual({
      title: 'T', artist: 'A', artworkUrl: 'https://x/300x300bb.jpg',
      sourceUrl: 'https://music.apple.com/us/album/t/1?i=2', provider: 'applemusic',
    })
  })
  it('returns null on a non-OK response', async () => {
    const fetchFn = async () => ({ ok: false, status: 500, async json() { return {} } })
    expect(await lookupTrack('2', { fetchFn })).toBeNull()
  })
})
