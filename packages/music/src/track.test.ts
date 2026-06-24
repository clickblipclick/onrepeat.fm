import { describe, expect, it } from 'vitest'

import { deriveTrack } from './track'

const json =
  (j: unknown, text = '') =>
  async () => ({
    ok: true,
    status: 200,
    async json() {
      return j
    },
    async text() {
      return text
    },
  })

describe('deriveTrack', () => {
  it('apple url → ok candidate from iTunes lookup', async () => {
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
      ok: true,
      candidate: { title: 'T', artist: 'A', provider: 'applemusic' },
    })
  })

  it('apple direct-song url → looks up the trailing path id', async () => {
    const fetchFn = async (url: string) => {
      expect(url).toContain('itunes.apple.com/lookup')
      expect(url).toContain('id=1886119379')
      return {
        ok: true,
        status: 200,
        async json() {
          return {
            results: [
              {
                trackName: 'Heaven',
                artistName: 'A',
                trackViewUrl:
                  'https://music.apple.com/us/album/heaven/1?i=1886119379',
              },
            ],
          }
        },
        async text() {
          return ''
        },
      }
    }
    const r = await deriveTrack(
      'https://music.apple.com/us/song/heaven/1886119379',
      { fetchFn },
    )
    expect(r).toMatchObject({
      ok: true,
      candidate: { title: 'Heaven', provider: 'applemusic' },
    })
  })

  it('apple url with no track id → unreadable', async () => {
    const r = await deriveTrack('https://music.apple.com/us/album/t/1')
    expect(r).toEqual({ ok: false, reason: 'unreadable' })
  })

  it('apple lookup 5xx → transient', async () => {
    const fetchFn = async () => ({
      ok: false,
      status: 500,
      async json() {
        return {}
      },
      async text() {
        return ''
      },
    })
    const r = await deriveTrack('https://music.apple.com/us/album/t/1?i=2', {
      fetchFn,
    })
    expect(r).toEqual({ ok: false, reason: 'transient' })
  })

  it('youtube url → ok, splitting "Artist - Title"', async () => {
    const fetchFn = json({
      title: 'Frank Ocean - Thinkin Bout You (Official)',
      author_name: 'FrankOceanVEVO',
      thumbnail_url: 'https://t/i.jpg',
    })
    const r = await deriveTrack('https://youtu.be/abc', { fetchFn })
    expect(r).toMatchObject({
      ok: true,
      candidate: {
        title: 'Thinkin Bout You (Official)',
        artist: 'Frank Ocean',
        provider: 'youtube',
      },
    })
  })

  it('youtube oEmbed 404 → unreadable', async () => {
    const fetchFn = async () => ({
      ok: false,
      status: 404,
      async json() {
        return {}
      },
      async text() {
        return ''
      },
    })
    const r = await deriveTrack('https://youtu.be/abc', { fetchFn })
    expect(r).toEqual({ ok: false, reason: 'unreadable' })
  })

  it('spotify url → ok: oEmbed title + artist from page meta', async () => {
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
      ok: true,
      candidate: {
        title: 'Thinkin Bout You',
        artist: 'Frank Ocean',
        provider: 'spotify',
      },
    })
  })

  it('spotify oEmbed network error → transient', async () => {
    const fetchFn = async () => {
      throw new Error('network')
    }
    const r = await deriveTrack('https://open.spotify.com/track/x', { fetchFn })
    expect(r).toEqual({ ok: false, reason: 'transient' })
  })

  it('bandcamp url → ok: scrapes title/artist/artwork', async () => {
    const fetchFn = json(
      {},
      '<meta property="og:title" content="Wet Hands, by C418"><meta property="og:image" content="https://f4.bcbits.com/img/a_10.jpg">',
    )
    const r = await deriveTrack('https://c418.bandcamp.com/track/wet-hands', {
      fetchFn,
    })
    expect(r).toMatchObject({
      ok: true,
      candidate: {
        title: 'Wet Hands',
        artist: 'C418',
        provider: 'bandcamp',
        artworkUrl: 'https://f4.bcbits.com/img/a_10.jpg',
      },
    })
  })

  it('bandcamp page with no parseable title → unreadable', async () => {
    const fetchFn = json({}, '<html></html>')
    const r = await deriveTrack('https://c418.bandcamp.com/track/x', {
      fetchFn,
    })
    expect(r).toEqual({ ok: false, reason: 'unreadable' })
  })

  it('bandcamp page fetch 502 → transient', async () => {
    const fetchFn = async () => ({
      ok: false,
      status: 502,
      async json() {
        return {}
      },
      async text() {
        return ''
      },
    })
    const r = await deriveTrack('https://c418.bandcamp.com/track/x', {
      fetchFn,
    })
    expect(r).toEqual({ ok: false, reason: 'transient' })
  })

  it('unknown provider → unknown-host', async () => {
    const r = await deriveTrack('https://example.com/song')
    expect(r).toEqual({ ok: false, reason: 'unknown-host' })
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
    expect(r).toMatchObject({ ok: true, candidate: { isLikelyMusic: false } })
  })

  it('does not flag a music youtube video (isLikelyMusic stays undefined)', async () => {
    const classifyYoutubeMusic = async () => true
    const r = await deriveTrack('https://www.youtube.com/watch?v=abc', {
      fetchFn: ytOembed('Artist - Song'),
      classifyYoutubeMusic,
    })
    expect(r).toMatchObject({ ok: true })
    if (r.ok) expect(r.candidate.isLikelyMusic).toBeUndefined()
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
    expect(r).toMatchObject({ ok: true })
    if (r.ok) expect(r.candidate.isLikelyMusic).toBeUndefined()
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
    expect(r).toMatchObject({ ok: true })
    if (r.ok) expect(r.candidate.isLikelyMusic).toBeUndefined()
  })

  it('soundcloud url → strips " by <artist>" from the oEmbed title', async () => {
    const fetchFn = json({
      title: 'Never Be Like You by Flume',
      author_name: 'Flume',
      thumbnail_url: 'https://t/i.jpg',
    })
    const r = await deriveTrack(
      'https://soundcloud.com/flume/never-be-like-you',
      { fetchFn },
    )
    expect(r).toMatchObject({
      ok: true,
      candidate: {
        title: 'Never Be Like You',
        artist: 'Flume',
        provider: 'soundcloud',
      },
    })
  })

  it('soundcloud: keeps a legitimate "by" in the title, strips only the author suffix', async () => {
    const fetchFn = json({
      title: 'Drive By by Train',
      author_name: 'Train',
      thumbnail_url: 'https://t/i.jpg',
    })
    const r = await deriveTrack('https://soundcloud.com/train/drive-by', {
      fetchFn,
    })
    expect(r).toMatchObject({
      ok: true,
      candidate: { title: 'Drive By', artist: 'Train', provider: 'soundcloud' },
    })
  })

  it('soundcloud: title with a dash AND a " by author" suffix', async () => {
    const fetchFn = json({
      title: 'Flume - Never Be Like You by Flume',
      author_name: 'Flume',
      thumbnail_url: 'https://t/i.jpg',
    })
    const r = await deriveTrack('https://soundcloud.com/flume/nblu', {
      fetchFn,
    })
    expect(r).toMatchObject({
      ok: true,
      candidate: {
        title: 'Never Be Like You',
        artist: 'Flume',
        provider: 'soundcloud',
      },
    })
  })
})
