import { describe, it, expect } from 'vitest'
import { fetchOembed, fetchOembedResult } from './oembed'

describe('fetchOembed', () => {
  it('returns null for a provider without an oEmbed endpoint', async () => {
    expect(
      await fetchOembed('bandcamp', 'https://x.bandcamp.com/track/y', {
        fetchFn: async () => {
          throw new Error('nope')
        },
      }),
    ).toBeNull()
  })

  it('maps title/author/thumbnail for a known provider', async () => {
    const fetchFn = async () => ({
      ok: true,
      status: 200,
      async json() {
        return {
          title: 'A - B',
          author_name: 'Chan',
          thumbnail_url: 'https://t/i.jpg',
        }
      },
    })
    expect(
      await fetchOembed('youtube', 'https://youtu.be/v', { fetchFn }),
    ).toEqual({ title: 'A - B', author: 'Chan', thumbnail: 'https://t/i.jpg' })
  })

  it('returns null on a non-OK response (soft failure)', async () => {
    const fetchFn = async () => ({
      ok: false,
      status: 404,
      async json() {
        return {}
      },
    })
    expect(
      await fetchOembed('spotify', 'https://open.spotify.com/track/x', {
        fetchFn,
      }),
    ).toBeNull()
  })
})

describe('fetchOembedResult', () => {
  const body = (j: unknown) => async () => ({
    ok: true,
    status: 200,
    async json() {
      return j
    },
  })

  it('ok with parsed fields on 200', async () => {
    const fetchFn = body({
      title: 'T',
      author_name: 'A',
      thumbnail_url: 'https://t/i.jpg',
    })
    expect(
      await fetchOembedResult('youtube', 'https://youtu.be/v', { fetchFn }),
    ).toEqual({
      ok: true,
      data: { title: 'T', author: 'A', thumbnail: 'https://t/i.jpg' },
    })
  })

  it('transient on 5xx', async () => {
    const fetchFn = async () => ({
      ok: false,
      status: 503,
      async json() {
        return {}
      },
    })
    expect(
      await fetchOembedResult('youtube', 'https://youtu.be/v', { fetchFn }),
    ).toEqual({
      ok: false,
      reason: 'transient',
    })
  })

  it('transient on a thrown network error', async () => {
    const fetchFn = async () => {
      throw new Error('network')
    }
    expect(
      await fetchOembedResult('youtube', 'https://youtu.be/v', { fetchFn }),
    ).toEqual({
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
    expect(
      await fetchOembedResult('youtube', 'https://youtu.be/v', { fetchFn }),
    ).toEqual({
      ok: false,
      reason: 'unreadable',
    })
  })

  it('unreadable for an unsupported provider', async () => {
    expect(
      await fetchOembedResult('tidal', 'https://tidal.com/track/1', {}),
    ).toEqual({
      ok: false,
      reason: 'unreadable',
    })
  })
})
