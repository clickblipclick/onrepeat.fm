import { describe, it, expect } from 'vitest'
import { trackIdentity } from './track-identity'

describe('trackIdentity', () => {
  it('prefers ISRC, normalized to uppercase alphanumerics', () => {
    expect(
      trackIdentity({ isrc: 'us-rc1-23-00001', title: 'X', artist: 'Y' }),
    ).toBe('isrc:USRC12300001')
  })

  it('falls back to the Odesli entity id when no ISRC', () => {
    expect(
      trackIdentity({ odesliId: 'SPOTIFY_SONG::abc', title: 'X', artist: 'Y' }),
    ).toBe('odesli:SPOTIFY_SONG::abc')
  })

  it('falls back to a normalized title|artist key', () => {
    const a = trackIdentity({ title: 'Mr. Brightside', artist: 'The Killers' })
    const b = trackIdentity({
      title: '  mr brightside ',
      artist: 'the   killers',
    })
    expect(a).toBe('ta:the killers|mr brightside')
    expect(a).toBe(b)
  })

  it('strips combining diacritics but keeps non-decomposable letters (matches @onrepeat/music normalizeTokens)', () => {
    // ï → NFKD → i + combining diaeresis (stripped) → "naive". ø has no canonical
    // decomposition and is a letter, so it's kept — consistent with normalizeTokens,
    // which uses the same \p{L}\p{N} class.
    expect(trackIdentity({ title: 'Naïve', artist: 'Sigø' })).toBe(
      'ta:sigø|naive',
    )
  })

  it('preserves non-Latin scripts (CJK / Cyrillic) instead of collapsing to an empty key', () => {
    expect(trackIdentity({ title: '夜に駆ける', artist: 'YOASOBI' })).toBe(
      'ta:yoasobi|夜に駆ける',
    )
    expect(trackIdentity({ title: 'Кукла', artist: 'Аукцыон' })).toBe(
      'ta:аукцыон|кукла',
    )
  })

  it('gives distinct non-Latin tracks distinct identities (no collision)', () => {
    const a = trackIdentity({ title: '夜に駆ける', artist: 'YOASOBI' })
    const b = trackIdentity({ title: '群青', artist: 'YOASOBI' })
    expect(a).not.toBe(b)
    expect(a).not.toBe('ta:yoasobi|')
  })

  it('collapses (parentheticals), [brackets], and feat tails so decorations dedupe', () => {
    const clean = trackIdentity({ title: 'Bohemian Rhapsody', artist: 'Queen' })
    expect(clean).toBe('ta:queen|bohemian rhapsody')
    expect(
      trackIdentity({
        title: 'Bohemian Rhapsody (Official Video Remastered)',
        artist: 'Queen',
      }),
    ).toBe(clean)
    expect(
      trackIdentity({
        title: 'Bohemian Rhapsody [Remastered 2011]',
        artist: 'Queen',
      }),
    ).toBe(clean)
    expect(
      trackIdentity({
        title: 'Dancing On My Own (feat. Someone)',
        artist: 'Robyn',
      }),
    ).toBe(trackIdentity({ title: 'Dancing On My Own', artist: 'Robyn' }))
    expect(
      trackIdentity({
        title: 'This Is What You Came For',
        artist: 'Calvin Harris feat. Rihanna',
      }),
    ).toBe(
      trackIdentity({
        title: 'This Is What You Came For',
        artist: 'Calvin Harris',
      }),
    )
  })

  it('ignores empty/whitespace ISRC and Odesli id', () => {
    expect(
      trackIdentity({ isrc: '   ', odesliId: '', title: 'A', artist: 'B' }),
    ).toBe('ta:b|a')
  })

  it('ignores a punctuation-only ISRC that normalizes to empty (falls back to title|artist)', () => {
    // '---' passes a naive trim check but normalizes to '' — must not collapse to the
    // shared key 'isrc:' (which would merge unrelated tracks and shadow title/artist).
    expect(
      trackIdentity({ isrc: '---', title: 'Real Title', artist: 'Real Artist' }),
    ).toBe('ta:real artist|real title')
  })

  it('accepts a title-only or artist-only fallback', () => {
    expect(trackIdentity({ title: 'Solo Title' })).toBe('ta:|solo title')
    expect(trackIdentity({ artist: 'Solo Artist' })).toBe('ta:solo artist|')
  })

  it('throws when no identifying field is present', () => {
    expect(() => trackIdentity({})).toThrow(/at least one/)
    expect(() =>
      trackIdentity({ isrc: '  ', title: '  ', artist: '' }),
    ).toThrow(/at least one/)
  })
})
