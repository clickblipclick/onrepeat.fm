import { describe, expect, it } from 'vitest'

import { trackIdentity } from './track-identity'

describe('trackIdentity', () => {
  it('builds a normalized title|artist key', () => {
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

  it('strips combining marks beyond U+0300–U+036F instead of splitting the word', () => {
    // U+1DC4 (macron-acute) lives in Combining Diacritical Marks Supplement — outside
    // the basic block. It must be deleted like any other mark, not turned into a space
    // by the punctuation pass (which would split "Tést" into "te st").
    expect(trackIdentity({ title: 'Te\u1DC4st', artist: 'A' })).toBe(
      'ta:a|test',
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

  it('keeps titles where "ft" means feet, not a credit', () => {
    // Bare "ft" (no dot) is not treated as a credit…
    expect(trackIdentity({ title: '50 Ft Queenie', artist: 'PJ Harvey' })).toBe(
      'ta:pj harvey|50 ft queenie',
    )
    // …and a title-initial "Ft." (Fort) is never a credit, even with the dot.
    expect(
      trackIdentity({ title: 'Ft. Worth Blues', artist: 'Steve Earle' }),
    ).toBe('ta:steve earle|ft worth blues')
  })

  it('accepts that a dotless "ft" credit does not dedupe (split key beats a wrong merge)', () => {
    expect(trackIdentity({ title: 'Song ft Someone', artist: 'A' })).toBe(
      'ta:a|song ft someone',
    )
  })

  it('accepts a title-only or artist-only key', () => {
    expect(trackIdentity({ title: 'Solo Title' })).toBe('ta:|solo title')
    expect(trackIdentity({ artist: 'Solo Artist' })).toBe('ta:solo artist|')
  })

  it('throws when no identifying field is present', () => {
    expect(() => trackIdentity({})).toThrow(/at least one/)
    expect(() => trackIdentity({ title: '  ', artist: '' })).toThrow(
      /at least one/,
    )
  })
})
