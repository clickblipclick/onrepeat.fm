import { describe, expect, it } from 'vitest'

import {
  fetchBandcampEmbed,
  parseBandcampArtwork,
  parseBandcampEmbedId,
  parseBandcampTitleArtist,
} from './bandcamp'

const ART = 'https://f4.bcbits.com/img/a1234567890_10.jpg'
const html = `<html><head>
<meta property="og:video"
    content="https://bandcamp.com/EmbeddedPlayer/v=2/track=1234567890/size=large/tracklist=false/artwork=small/">
<meta property="og:image" content="${ART}">
</head></html>`

describe('parseBandcampEmbedId', () => {
  it('extracts the EmbeddedPlayer track id', () => {
    expect(parseBandcampEmbedId(html)).toBe('1234567890')
  })
  it('returns null when absent', () => {
    expect(parseBandcampEmbedId('<html></html>')).toBeNull()
  })
})

describe('parseBandcampArtwork', () => {
  it('extracts the og:image cover url', () => {
    expect(parseBandcampArtwork(html)).toBe(ART)
  })
  it('handles reversed attribute order', () => {
    expect(
      parseBandcampArtwork(`<meta content="${ART}" property="og:image">`),
    ).toBe(ART)
  })
  it('returns null when absent', () => {
    expect(parseBandcampArtwork('<html></html>')).toBeNull()
  })
})

describe('parseBandcampTitleArtist', () => {
  it('splits the canonical "Title, by Artist" og:title', () => {
    expect(
      parseBandcampTitleArtist(
        '<meta property="og:title" content="Wet Hands, by C418">',
      ),
    ).toEqual({ title: 'Wet Hands', artist: 'C418' })
  })
  it('falls back to og:site_name when og:title has no ", by"', () => {
    const h =
      '<meta property="og:title" content="Wet Hands"><meta property="og:site_name" content="C418">'
    expect(parseBandcampTitleArtist(h)).toEqual({
      title: 'Wet Hands',
      artist: 'C418',
    })
  })
  it('decodes HTML entities in title and artist', () => {
    expect(
      parseBandcampTitleArtist(
        '<meta property="og:title" content="Rock &amp; Roll, by Simon &amp; Garfunkel">',
      ),
    ).toEqual({ title: 'Rock & Roll', artist: 'Simon & Garfunkel' })
  })
  it('splits on the last ", by " (titles may contain it)', () => {
    expect(
      parseBandcampTitleArtist(
        '<meta property="og:title" content="Stand By Me, by Ben">',
      ),
    ).toEqual({ title: 'Stand By Me', artist: 'Ben' })
  })
  it('returns null when there is no og:title', () => {
    expect(parseBandcampTitleArtist('<html></html>')).toBeNull()
  })
})

describe('fetchBandcampEmbed', () => {
  it('returns the trackId and og:image artwork', async () => {
    const fetchFn = async () => ({
      ok: true,
      status: 200,
      async text() {
        return html
      },
    })
    expect(
      await fetchBandcampEmbed('https://x.bandcamp.com/track/y', { fetchFn }),
    ).toEqual({ trackId: '1234567890', artworkUrl: ART })
  })
  it('returns just the artwork when there is no embed id', async () => {
    const fetchFn = async () => ({
      ok: true,
      status: 200,
      async text() {
        return `<meta property="og:image" content="${ART}">`
      },
    })
    expect(
      await fetchBandcampEmbed('https://x.bandcamp.com/track/y', { fetchFn }),
    ).toEqual({ artworkUrl: ART })
  })
  it('returns null on non-OK or when neither id nor artwork is present (soft fail)', async () => {
    expect(
      await fetchBandcampEmbed('https://x.bandcamp.com/track/y', {
        fetchFn: async () => ({
          ok: false,
          status: 404,
          async text() {
            return ''
          },
        }),
      }),
    ).toBeNull()
    expect(
      await fetchBandcampEmbed('https://x.bandcamp.com/track/y', {
        fetchFn: async () => ({
          ok: true,
          status: 200,
          async text() {
            return '<html></html>'
          },
        }),
      }),
    ).toBeNull()
  })

  it('requests with redirect:error so an open redirect cannot bounce the fetch (SSRF guard)', async () => {
    let seenRedirect: string | undefined
    const fetchFn = async (_url: string, init?: { redirect?: string }) => {
      seenRedirect = init?.redirect
      return {
        ok: true,
        status: 200,
        async text() {
          return html
        },
      }
    }
    await fetchBandcampEmbed('https://x.bandcamp.com/track/y', { fetchFn })
    expect(seenRedirect).toBe('error')
  })

  it('returns null when the body exceeds the size cap (OOM guard)', async () => {
    // A body stream that would emit far more than the 1 MiB cap if read to completion.
    const chunk = new Uint8Array(256 * 1024) // 256 KiB
    let emitted = 0
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        emitted += 1
        controller.enqueue(chunk) // 5 × 256 KiB = 1.25 MiB > cap, never "done"
      },
    })
    const fetchFn = async () => ({
      ok: true,
      status: 200,
      body,
      async text() {
        throw new Error('should read body stream, not text()')
      },
    })
    expect(
      await fetchBandcampEmbed('https://x.bandcamp.com/track/y', { fetchFn }),
    ).toBeNull()
    expect(emitted).toBeLessThanOrEqual(6) // bailed early, didn't drain forever
  })

  it('refuses non-bandcamp / non-https urls without fetching (SSRF guard)', async () => {
    let called = false
    const fetchFn = async () => {
      called = true
      return {
        ok: true,
        status: 200,
        async text() {
          return html
        },
      }
    }
    for (const url of [
      'http://169.254.169.254/latest/meta-data/', // cloud metadata
      'http://localhost:5432/',
      'https://evil.com/track/y',
      'https://bandcamp.com.evil.com/track/y', // suffix spoof
      'http://x.bandcamp.com/track/y', // plain http
      'file:///etc/passwd',
      'not a url',
    ]) {
      expect(await fetchBandcampEmbed(url, { fetchFn })).toBeNull()
    }
    expect(called).toBe(false)
  })
})
