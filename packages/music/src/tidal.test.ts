import { describe, expect, it } from 'vitest'

import {
  canonicalTidalUrl,
  extractTidalTrackId,
  fetchTidalTrack,
  parseTidalArtwork,
  parseTidalTitleArtist,
} from './tidal'

const ART =
  'https://resources.tidal.com/images/6b8a4883/0e65/4764/a8e2/98ea78e9ca54/640x640.jpg'
const html = `<html><head>
<meta property="og:type" content="music.song">
<meta property="og:title" content="Afterhour Chillout - Internal Calm">
<meta property="og:image" content="${ART}">
</head></html>`

describe('extractTidalTrackId', () => {
  it('extracts the id from every Tidal track URL shape', () => {
    for (const url of [
      'https://tidal.com/track/77646168',
      'https://tidal.com/browse/track/77646168',
      'https://listen.tidal.com/track/77646168',
      'https://listen.tidal.com/album/284165608/track/77646168',
      'https://tidal.com/browse/track/77646168?u', // share links carry query params
    ]) {
      expect(extractTidalTrackId(url)).toBe('77646168')
    }
  })
  it('returns null when there is no numeric track segment', () => {
    for (const url of [
      'https://tidal.com/album/284165608', // album, no track
      'https://tidal.com/track/not-a-number',
      'https://tidal.com/track/', // no id segment
      'https://tidal.com/browse/artist/1566',
      'not a url',
      'file:///etc/passwd',
    ]) {
      expect(extractTidalTrackId(url)).toBeNull()
    }
  })
})

describe('canonicalTidalUrl', () => {
  it('builds the canonical track page url', () => {
    expect(canonicalTidalUrl('77646168')).toBe(
      'https://tidal.com/track/77646168',
    )
  })
})

describe('parseTidalTitleArtist', () => {
  it('splits the "Artist - Title" og:title', () => {
    expect(parseTidalTitleArtist(html)).toEqual({
      artist: 'Afterhour Chillout',
      title: 'Internal Calm',
    })
  })
  it('splits on the FIRST dash (titles may contain dashes)', () => {
    expect(
      parseTidalTitleArtist(
        '<meta property="og:title" content="M83 - Midnight City - Edit">',
      ),
    ).toEqual({ artist: 'M83', title: 'Midnight City - Edit' })
  })
  it('falls back to title-only when there is no dash', () => {
    expect(
      parseTidalTitleArtist('<meta property="og:title" content="Untitled">'),
    ).toEqual({ title: 'Untitled', artist: '' })
  })
  it('decodes HTML entities', () => {
    expect(
      parseTidalTitleArtist(
        '<meta property="og:title" content="Simon &amp; Garfunkel - Rock &amp; Roll">',
      ),
    ).toEqual({ artist: 'Simon & Garfunkel', title: 'Rock & Roll' })
  })
  it('returns null when there is no og:title', () => {
    expect(parseTidalTitleArtist('<html></html>')).toBeNull()
  })
})

describe('parseTidalArtwork', () => {
  it('extracts the og:image cover url', () => {
    expect(parseTidalArtwork(html)).toBe(ART)
  })
  it('returns null when absent', () => {
    expect(parseTidalArtwork('<html></html>')).toBeNull()
  })
})

describe('fetchTidalTrack', () => {
  it('fetches the canonical page and returns title/artist/artwork', async () => {
    let seenUrl: string | undefined
    const fetchFn = async (url: string) => {
      seenUrl = url
      return {
        ok: true,
        status: 200,
        async text() {
          return html
        },
      }
    }
    expect(await fetchTidalTrack('77646168', { fetchFn })).toEqual({
      title: 'Internal Calm',
      artist: 'Afterhour Chillout',
      artworkUrl: ART,
    })
    expect(seenUrl).toBe('https://tidal.com/track/77646168')
  })
  it('omits artworkUrl when og:image is absent', async () => {
    const fetchFn = async () => ({
      ok: true,
      status: 200,
      async text() {
        return '<meta property="og:title" content="A - T">'
      },
    })
    // toStrictEqual: the key must be truly absent, not present with value undefined.
    expect(await fetchTidalTrack('1', { fetchFn })).toStrictEqual({
      title: 'T',
      artist: 'A',
    })
  })
  it('soft-fails to null on non-OK, thrown fetch, or a page with no og:title', async () => {
    expect(
      await fetchTidalTrack('1', {
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
      await fetchTidalTrack('1', {
        fetchFn: async () => {
          throw new Error('network')
        },
      }),
    ).toBeNull()
    expect(
      await fetchTidalTrack('1', {
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
  it('refuses a non-numeric id without fetching', async () => {
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
    expect(await fetchTidalTrack('../evil', { fetchFn })).toBeNull()
    expect(called).toBe(false)
  })
  it('requests with redirect:error (SSRF hardening convention)', async () => {
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
    await fetchTidalTrack('77646168', { fetchFn })
    expect(seenRedirect).toBe('error')
  })
  it('returns null when the body exceeds the size cap (OOM guard)', async () => {
    const chunk = new Uint8Array(256 * 1024)
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        controller.enqueue(chunk) // never "done" — must be cut off by the cap
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
    expect(await fetchTidalTrack('77646168', { fetchFn })).toBeNull()
  })
})
