import { describe, it, expect } from 'vitest'
import {
  createYoutubeClient,
  fetchYoutubeCategory,
  mapYoutubeSearch,
  parseIso8601Duration,
  youtubeVideoId,
} from './youtube'

describe('youtubeVideoId', () => {
  it('extracts the id from watch / youtu.be / music urls, null otherwise', () => {
    expect(youtubeVideoId('https://www.youtube.com/watch?v=abc123')).toBe('abc123')
    expect(youtubeVideoId('https://youtu.be/abc123')).toBe('abc123')
    expect(youtubeVideoId('https://music.youtube.com/watch?v=abc123&list=RDx')).toBe('abc123')
    expect(youtubeVideoId('https://www.youtube.com/playlist?list=PL123')).toBeNull()
    expect(youtubeVideoId('https://www.youtube.com/@google')).toBeNull()
    expect(youtubeVideoId('https://example.com/watch?v=abc')).toBeNull()
    expect(youtubeVideoId('not a url')).toBeNull()
  })
})

describe('fetchYoutubeCategory', () => {
  it('returns the categoryId from the video snippet', async () => {
    const fetchFn = async (url: string) => {
      expect(url).toContain('/videos?part=snippet')
      expect(url).toContain('id=v1')
      return { ok: true, status: 200, async json() { return { items: [{ snippet: { categoryId: '10' } }] } } }
    }
    expect(await fetchYoutubeCategory('v1', { apiKey: 'k', fetchFn })).toBe('10')
  })

  it('returns null on a non-ok response (e.g. quota)', async () => {
    const fetchFn = async () => ({ ok: false, status: 403, async json() { return {} } })
    expect(await fetchYoutubeCategory('v1', { apiKey: 'k', fetchFn })).toBeNull()
  })

  it('returns null when the video is not found', async () => {
    const fetchFn = async () => ({ ok: true, status: 200, async json() { return { items: [] } } })
    expect(await fetchYoutubeCategory('v1', { apiKey: 'k', fetchFn })).toBeNull()
  })

  it('returns null for a blank id without fetching', async () => {
    let called = false
    const fetchFn = async () => { called = true; return { ok: true, status: 200, async json() { return {} } } }
    expect(await fetchYoutubeCategory('  ', { apiKey: 'k', fetchFn })).toBeNull()
    expect(called).toBe(false)
  })
})

describe('parseIso8601Duration', () => {
  it('parses H/M/S', () => {
    expect(parseIso8601Duration('PT3M21S')).toBe(201)
    expect(parseIso8601Duration('PT1H2M3S')).toBe(3723)
    expect(parseIso8601Duration('PT45S')).toBe(45)
    expect(parseIso8601Duration('garbage')).toBe(0)
  })
})

describe('mapYoutubeSearch', () => {
  it('maps search items, dropping ones without a videoId', () => {
    const out = mapYoutubeSearch({
      items: [
        { id: { videoId: 'v1' }, snippet: { title: 'A - B', channelTitle: 'Chan' } },
        { id: {}, snippet: { title: 'x' } },
      ],
    })
    expect(out).toEqual([
      { videoId: 'v1', url: 'https://www.youtube.com/watch?v=v1', title: 'A - B', channelTitle: 'Chan' },
    ])
  })
})

describe('createYoutubeClient', () => {
  const fetchFn = async (url: string) => {
    if (url.includes('/search')) {
      return { ok: true, status: 200, async json() { return { items: [{ id: { videoId: 'v1' }, snippet: { title: 'A - B', channelTitle: 'Chan' } }] } } }
    }
    if (url.includes('/videos')) {
      return { ok: true, status: 200, async json() { return { items: [{ id: 'v1', contentDetails: { duration: 'PT3M21S' }, status: { embeddable: false } }] } } }
    }
    return { ok: false, status: 404, async json() { return {} } }
  }

  it('searchVideo returns mapped videos', async () => {
    const c = createYoutubeClient({ apiKey: 'k', fetchFn })
    expect((await c.searchVideo('a b'))[0]?.videoId).toBe('v1')
  })

  it('lookupVideos returns duration and embeddability per id (one part=contentDetails,status call)', async () => {
    let calledUrl = ''
    const c = createYoutubeClient({ apiKey: 'k', fetchFn: async (u: string) => { calledUrl = u; return fetchFn(u) } })
    const m = await c.lookupVideos(['v1'])
    expect(m.get('v1')).toEqual({ durationSec: 201, embeddable: false })
    expect(calledUrl).toContain('part=contentDetails,status')
  })

  it('lookupVideos short-circuits on empty input', async () => {
    const c = createYoutubeClient({ apiKey: 'k', fetchFn })
    expect((await c.lookupVideos([])).size).toBe(0)
  })
})
