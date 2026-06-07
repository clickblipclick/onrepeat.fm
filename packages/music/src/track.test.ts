import { describe, it, expect } from 'vitest'
import { deriveTrack } from './track'

describe('deriveTrack', () => {
  it('apple url → iTunes lookup', async () => {
    const fetchFn = async (url: string) => {
      expect(url).toContain('itunes.apple.com/lookup')
      return {
        ok: true,
        status: 200,
        async json() {
          return {
            results: [
              {
                trackName: 'T',
                artistName: 'A',
                artworkUrl100: 'https://x/100x100bb.jpg',
                trackViewUrl: 'https://music.apple.com/us/album/t/1?i=2',
              },
            ],
          }
        },
        async text() {
          return ''
        },
      }
    }
    const r = await deriveTrack('https://music.apple.com/us/album/t/1?i=2', {
      fetchFn,
    })
    expect(r).toMatchObject({
      title: 'T',
      artist: 'A',
      provider: 'applemusic',
      sourceUrl: 'https://music.apple.com/us/album/t/1?i=2',
    })
  })

  it('youtube url → oEmbed, splitting "Artist - Title"', async () => {
    const fetchFn = async () => ({
      ok: true,
      status: 200,
      async json() {
        return {
          title: 'Frank Ocean - Thinkin Bout You (Official)',
          author_name: 'FrankOceanVEVO',
          thumbnail_url: 'https://t/i.jpg',
        }
      },
      async text() {
        return ''
      },
    })
    const r = await deriveTrack('https://youtu.be/abc', { fetchFn })
    expect(r).toMatchObject({
      title: 'Thinkin Bout You (Official)',
      artist: 'Frank Ocean',
      provider: 'youtube',
    })
  })

  it('spotify url → oEmbed title + artist from page meta', async () => {
    const fetchFn = async (u: string) => {
      if (u.includes('/oembed'))
        return {
          ok: true,
          status: 200,
          async json() {
            return {
              title: 'Thinkin Bout You',
              thumbnail_url: 'https://t/i.jpg',
            }
          },
          async text() {
            return ''
          },
        }
      return {
        ok: true,
        status: 200,
        async json() {
          return {}
        },
        async text() {
          return '<meta name="music:musician_description" content="Frank Ocean">'
        },
      }
    }
    const r = await deriveTrack('https://open.spotify.com/track/x', { fetchFn })
    expect(r).toMatchObject({
      title: 'Thinkin Bout You',
      artist: 'Frank Ocean',
      provider: 'spotify',
    })
  })

  it('bandcamp url → scrapes title/artist/artwork from the page', async () => {
    const fetchFn = async () => ({
      ok: true,
      status: 200,
      async json() {
        return {}
      },
      async text() {
        return '<meta property="og:title" content="Wet Hands, by C418"><meta property="og:image" content="https://f4.bcbits.com/img/a_10.jpg">'
      },
    })
    const r = await deriveTrack('https://c418.bandcamp.com/track/wet-hands', {
      fetchFn,
    })
    expect(r).toMatchObject({
      title: 'Wet Hands',
      artist: 'C418',
      provider: 'bandcamp',
      artworkUrl: 'https://f4.bcbits.com/img/a_10.jpg',
      sourceUrl: 'https://c418.bandcamp.com/track/wet-hands',
    })
  })

  it('bandcamp url with no og:title → null (manual entry)', async () => {
    const fetchFn = async () => ({
      ok: true,
      status: 200,
      async json() {
        return {}
      },
      async text() {
        return '<html></html>'
      },
    })
    expect(
      await deriveTrack('https://c418.bandcamp.com/track/x', { fetchFn }),
    ).toBeNull()
  })

  it('unknown provider → null (manual entry)', async () => {
    expect(await deriveTrack('https://example.com/song')).toBeNull()
  })

  it('soft-fails to null when the lookup errors', async () => {
    const fetchFn = async () => {
      throw new Error('network')
    }
    expect(
      await deriveTrack('https://open.spotify.com/track/x', { fetchFn }),
    ).toBeNull()
  })

  const ytOembed =
    (title: string, author = 'Chan') =>
    async () => ({
      ok: true,
      status: 200,
      async json() {
        return { title, author_name: author }
      },
      async text() {
        return ''
      },
    })

  it('flags a non-music youtube video (isLikelyMusic false) via the classifier', async () => {
    const classifyYoutubeMusic = async (videoId: string) => {
      expect(videoId).toBe('abc')
      return false
    }
    const r = await deriveTrack('https://www.youtube.com/watch?v=abc', {
      fetchFn: ytOembed('How to Tie a Tie'),
      classifyYoutubeMusic,
    })
    expect(r?.isLikelyMusic).toBe(false)
  })

  it('does not flag a music youtube video (isLikelyMusic stays undefined)', async () => {
    const classifyYoutubeMusic = async () => true
    const r = await deriveTrack('https://www.youtube.com/watch?v=abc', {
      fetchFn: ytOembed('Artist - Song'),
      classifyYoutubeMusic,
    })
    expect(r?.isLikelyMusic).toBeUndefined()
  })

  it('does not classify when there is no videoId (e.g. a playlist url)', async () => {
    let called = false
    const classifyYoutubeMusic = async () => {
      called = true
      return false
    }
    const r = await deriveTrack('https://www.youtube.com/playlist?list=PL', {
      fetchFn: ytOembed('Popular Music Videos', 'Music'),
      classifyYoutubeMusic,
    })
    expect(called).toBe(false)
    expect(r?.isLikelyMusic).toBeUndefined()
  })

  it('does not classify non-youtube providers (spotify)', async () => {
    let called = false
    const classifyYoutubeMusic = async () => {
      called = true
      return false
    }
    const fetchFn = async (u: string) => {
      if (u.includes('/oembed'))
        return {
          ok: true,
          status: 200,
          async json() {
            return { title: 'Song' }
          },
          async text() {
            return ''
          },
        }
      return {
        ok: true,
        status: 200,
        async json() {
          return {}
        },
        async text() {
          return '<meta name="music:musician_description" content="Artist">'
        },
      }
    }
    const r = await deriveTrack('https://open.spotify.com/track/x', {
      fetchFn,
      classifyYoutubeMusic,
    })
    expect(called).toBe(false)
    expect(r?.isLikelyMusic).toBeUndefined()
  })
})
