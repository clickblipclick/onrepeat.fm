import { describe, expect, it } from 'vitest'

import { isTrustedArtworkUrl } from './artwork'

describe('isTrustedArtworkUrl', () => {
  it('accepts https URLs on known art CDNs', () => {
    for (const url of [
      'https://is1-ssl.mzstatic.com/image/thumb/abc.jpg',
      'https://i.scdn.co/image/ab67616d0000b273',
      'https://f4.bcbits.com/img/a1234567_10.jpg',
      'https://i.ytimg.com/vi/abc/hqdefault.jpg',
      'https://i1.sndcdn.com/artworks-abc-large.jpg',
      'https://image-cdn-fa.spotifycdn.com/image/ab67616d00001e0259f15d080856e3a386ebffb9',
      'https://mzstatic.com/x.jpg', // exact apex host
      'https://resources.tidal.com/images/6b8a4883/0e65/4764/a8e2/98ea78e9ca54/640x640.jpg',
    ]) {
      expect(isTrustedArtworkUrl(url)).toBe(true)
    }
  })

  it('rejects SSRF targets and non-CDN hosts', () => {
    for (const url of [
      'http://169.254.169.254/latest/meta-data/', // cloud metadata
      'http://localhost:6379/',
      'http://127.0.0.1/',
      'https://evil.com/x.jpg',
      'https://evil-scdn.co/x.jpg', // not dot-anchored under scdn.co
      'https://evil-spotifycdn.com/x.jpg', // not dot-anchored under spotifycdn.com
      'https://scdn.co.attacker.com/x.jpg', // suffix-spoof
      'https://resources.tidal.com.attacker.com/x.jpg', // suffix-spoof
      'https://tidal.com/x.jpg', // only the art host is trusted, not the whole domain
    ]) {
      expect(isTrustedArtworkUrl(url)).toBe(false)
    }
  })

  it('rejects http (non-https) even on an allowlisted host', () => {
    expect(isTrustedArtworkUrl('http://i.scdn.co/image/abc')).toBe(false)
  })

  it('rejects empty / nullish / unparseable input', () => {
    expect(isTrustedArtworkUrl(null)).toBe(false)
    expect(isTrustedArtworkUrl(undefined)).toBe(false)
    expect(isTrustedArtworkUrl('')).toBe(false)
    expect(isTrustedArtworkUrl('not a url')).toBe(false)
  })
})

describe('isTrustedArtworkUrl extraHosts', () => {
  it('trusts an explicitly allowed extra host', () => {
    expect(
      isTrustedArtworkUrl('https://art.onrepeat.fm/art/abc.jpg', [
        'art.onrepeat.fm',
      ]),
    ).toBe(true)
  })

  it('still rejects unknown hosts when extraHosts is given', () => {
    expect(
      isTrustedArtworkUrl('https://evil.example/a.jpg', ['art.onrepeat.fm']),
    ).toBe(false)
  })

  it('rejects our CDN host over http', () => {
    expect(
      isTrustedArtworkUrl('http://art.onrepeat.fm/a.jpg', ['art.onrepeat.fm']),
    ).toBe(false)
  })
})
