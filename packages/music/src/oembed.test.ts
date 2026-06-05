import { describe, it, expect } from 'vitest'
import { fetchOembed } from './oembed'

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
