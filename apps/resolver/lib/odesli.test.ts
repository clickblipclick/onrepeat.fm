import { describe, it, expect, vi } from 'vitest'
import { mapOdesli, createOdesliClient } from './odesli'

const sample = {
  entityUniqueId: 'SPOTIFY_SONG::abc',
  pageUrl: 'https://song.link/s/abc',
  entitiesByUniqueId: {
    'SPOTIFY_SONG::abc': { title: 'Song', artistName: 'Artist', thumbnailUrl: 'https://img/x.jpg' },
  },
  linksByPlatform: {
    spotify: { url: 'https://open.spotify.com/track/abc' },
    appleMusic: { url: 'https://music.apple.com/song/abc' },
    youtube: { url: 'https://youtu.be/abc' },
  },
}

describe('mapOdesli', () => {
  it('maps links to lowercase provider keys and pulls canonical metadata', () => {
    const r = mapOdesli(sample)
    expect(r.notFound).toBe(false)
    expect(r.title).toBe('Song')
    expect(r.artist).toBe('Artist')
    expect(r.artworkUrl).toBe('https://img/x.jpg')
    expect(r.providerRefs.spotify).toEqual({ url: 'https://open.spotify.com/track/abc' })
    expect(r.providerRefs.applemusic).toEqual({ url: 'https://music.apple.com/song/abc' })
    expect(r.providerRefs.youtube).toEqual({ url: 'https://youtu.be/abc' })
    expect(r.providerRefs.songlink).toEqual({ url: 'https://song.link/s/abc' })
  })

  it('handles a missing linksByPlatform gracefully', () => {
    const r = mapOdesli({})
    expect(r.notFound).toBe(false)
    expect(r.providerRefs).toEqual({})
  })

  it('omits a platform entry that has no url', () => {
    const r = mapOdesli({ linksByPlatform: { spotify: {} } })
    expect(r.providerRefs.spotify).toBeUndefined()
  })

  it('omits canonical metadata when entityUniqueId is absent', () => {
    const r = mapOdesli({ linksByPlatform: {}, pageUrl: 'https://song.link/x' })
    expect(r.title).toBeUndefined()
    expect(r.providerRefs.songlink).toEqual({ url: 'https://song.link/x' })
  })
})

describe('createOdesliClient', () => {
  it('returns notFound on HTTP 404', async () => {
    const fetchFn = vi.fn(async () => ({ status: 404, ok: false, json: async () => ({}) }) as any)
    const client = createOdesliClient({ fetchFn, throttle: async () => {} })
    const r = await client.resolve('https://open.spotify.com/track/x')
    expect(r.notFound).toBe(true)
  })

  it('throws on a transient 5xx (so pg-boss retries)', async () => {
    const fetchFn = vi.fn(async () => ({ status: 503, ok: false, json: async () => ({}) }) as any)
    const client = createOdesliClient({ fetchFn, throttle: async () => {} })
    await expect(client.resolve('https://open.spotify.com/track/x')).rejects.toThrow(/503/)
  })

  it('throttles, fetches, and maps on success', async () => {
    const throttle = vi.fn(async () => {})
    const fetchFn = vi.fn(async () => ({ status: 200, ok: true, json: async () => sample }) as any)
    const client = createOdesliClient({ fetchFn, throttle })
    const r = await client.resolve('https://open.spotify.com/track/abc')
    expect(throttle).toHaveBeenCalledTimes(1)
    expect(fetchFn).toHaveBeenCalledTimes(1)
    expect(r.title).toBe('Song')
  })
})
