import { describe, it, expect } from 'vitest'
import { trackIdentity } from './track-identity'

describe('trackIdentity', () => {
  it('prefers ISRC, normalized to uppercase alphanumerics', () => {
    expect(trackIdentity({ isrc: 'us-rc1-23-00001', title: 'X', artist: 'Y' }))
      .toBe('isrc:USRC12300001')
  })

  it('falls back to the Odesli entity id when no ISRC', () => {
    expect(trackIdentity({ odesliId: 'SPOTIFY_SONG::abc', title: 'X', artist: 'Y' }))
      .toBe('odesli:SPOTIFY_SONG::abc')
  })

  it('falls back to a normalized title|artist key', () => {
    const a = trackIdentity({ title: 'Mr. Brightside', artist: 'The Killers' })
    const b = trackIdentity({ title: '  mr brightside ', artist: 'the   killers' })
    expect(a).toBe('ta:the killers|mr brightside')
    expect(a).toBe(b)
  })

  it('strips diacritics in the title|artist fallback', () => {
    expect(trackIdentity({ title: 'Naïve', artist: 'Sigø' }))
      .toBe('ta:sig|naive')
  })

  it('ignores empty/whitespace ISRC and Odesli id', () => {
    expect(trackIdentity({ isrc: '   ', odesliId: '', title: 'A', artist: 'B' }))
      .toBe('ta:b|a')
  })
})
