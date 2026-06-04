import { describe, it, expect } from 'vitest'
import { parseBandcampEmbedId, fetchBandcampEmbed } from './bandcamp'

const html = `<html><head>
<meta property="og:video"
    content="https://bandcamp.com/EmbeddedPlayer/v=2/track=1234567890/size=large/tracklist=false/artwork=small/">
</head></html>`

describe('parseBandcampEmbedId', () => {
  it('extracts the EmbeddedPlayer track id', () => {
    expect(parseBandcampEmbedId(html)).toBe('1234567890')
  })
  it('returns null when absent', () => {
    expect(parseBandcampEmbedId('<html></html>')).toBeNull()
  })
})

describe('fetchBandcampEmbed', () => {
  it('returns { trackId } on a page that has it', async () => {
    const fetchFn = async () => ({ ok: true, status: 200, async text() { return html } })
    expect(await fetchBandcampEmbed('https://x.bandcamp.com/track/y', { fetchFn })).toEqual({ trackId: '1234567890' })
  })
  it('returns null on non-OK or no id (soft fail)', async () => {
    expect(await fetchBandcampEmbed('https://x.bandcamp.com/track/y', { fetchFn: async () => ({ ok: false, status: 404, async text() { return '' } }) })).toBeNull()
    expect(await fetchBandcampEmbed('https://x.bandcamp.com/track/y', { fetchFn: async () => ({ ok: true, status: 200, async text() { return '<html></html>' } }) })).toBeNull()
  })
})
