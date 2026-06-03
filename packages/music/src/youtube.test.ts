import { describe, it, expect } from 'vitest'
import { createYoutubeClient, mapYoutubeSearch, parseIso8601Duration } from './youtube'

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
      return { ok: true, status: 200, async json() { return { items: [{ id: 'v1', contentDetails: { duration: 'PT3M21S' } }] } } }
    }
    return { ok: false, status: 404, async json() { return {} } }
  }

  it('searchVideo returns mapped videos', async () => {
    const c = createYoutubeClient({ apiKey: 'k', fetchFn })
    expect((await c.searchVideo('a b'))[0]?.videoId).toBe('v1')
  })

  it('lookupDurations returns a videoId→seconds map', async () => {
    const c = createYoutubeClient({ apiKey: 'k', fetchFn })
    const m = await c.lookupDurations(['v1'])
    expect(m.get('v1')).toBe(201)
  })

  it('lookupDurations short-circuits on empty input', async () => {
    const c = createYoutubeClient({ apiKey: 'k', fetchFn })
    expect((await c.lookupDurations([])).size).toBe(0)
  })
})
