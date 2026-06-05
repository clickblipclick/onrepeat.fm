import { describe, it, expect } from 'vitest'
import {
  parseBandcampEmbedId,
  parseBandcampArtwork,
  fetchBandcampEmbed,
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
})
