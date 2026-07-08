import { describe, expect, it } from 'vitest'

import { isConfidentMatch, normalizeTokens } from './match'

describe('normalizeTokens', () => {
  it('lowercases, strips parentheticals/feat/punctuation', () => {
    expect(normalizeTokens('Thinkin Bout You (Remastered 2009)')).toEqual([
      'thinkin',
      'bout',
      'you',
    ])
    expect(normalizeTokens('Song feat. Someone')).toEqual(['song'])
    expect(normalizeTokens('Song ft. Someone')).toEqual(['song'])
    expect(normalizeTokens('A-Punk!')).toEqual(['a', 'punk'])
  })

  it('keeps titles where "ft" means feet, not a credit', () => {
    // Bare "ft" (no dot) is not a credit; title-initial "Ft." (Fort) never is.
    // Mirrors trackIdentity in @onrepeat/core — see the comment there.
    expect(normalizeTokens('50 Ft Queenie')).toEqual(['50', 'ft', 'queenie'])
    expect(normalizeTokens('Ft. Worth Blues')).toEqual(['ft', 'worth', 'blues'])
  })

  it('strips a remaster dash-tail (Spotify writes versions as "Title - Version")', () => {
    expect(normalizeTokens('Dreams - 2004 Remaster')).toEqual(['dreams'])
    expect(normalizeTokens('Song - Remastered 2009')).toEqual(['song'])
    expect(normalizeTokens('Song - 2011 Remastered Version')).toEqual(['song'])
    expect(normalizeTokens('Song - Remastered')).toEqual(['song'])
  })

  it('keeps non-remaster dash tails — live/mix names denote a different recording', () => {
    expect(normalizeTokens('Dreams - Live')).toEqual(['dreams', 'live'])
    expect(normalizeTokens('Crazy - Midnight Mix')).toEqual([
      'crazy',
      'midnight',
      'mix',
    ])
  })

  it('folds diacritics so cross-provider spellings match (like trackIdentity)', () => {
    expect(normalizeTokens('Beyoncé')).toEqual(['beyonce'])
    expect(
      isConfidentMatch(
        { title: 'Halo', artist: 'Beyoncé' },
        { title: 'Halo', artist: 'Beyonce' },
      ),
    ).toBe(true)
  })
})

describe('isConfidentMatch', () => {
  const anchor = {
    title: 'Thinkin Bout You',
    artist: 'Frank Ocean',
    durationSec: 200,
  }

  it('matches an exact Spotify-style candidate', () => {
    expect(
      isConfidentMatch(anchor, {
        title: 'Thinkin Bout You',
        artist: 'Frank Ocean',
        durationSec: 201,
      }),
    ).toBe(true)
  })

  it('matches a YouTube-style title that embeds artist + decorations (with close duration)', () => {
    expect(
      isConfidentMatch(anchor, {
        title: 'Frank Ocean - Thinkin Bout You (Official Audio)',
        artist: 'FrankOceanVEVO',
        durationSec: 202,
      }),
    ).toBe(true)
  })

  it('accepts a duration gap at the tolerance boundary, rejects one past it', () => {
    const candidate = { title: 'Thinkin Bout You', artist: 'Frank Ocean' }
    expect(isConfidentMatch(anchor, { ...candidate, durationSec: 204 })).toBe(
      true,
    )
    expect(isConfidentMatch(anchor, { ...candidate, durationSec: 205 })).toBe(
      false,
    )
  })

  it('rejects when the anchor normalizes to no tokens at all', () => {
    expect(
      isConfidentMatch(
        { title: '!!!', artist: '' },
        { title: '!!!', artist: '' },
      ),
    ).toBe(false)
  })

  it('rejects a duration mismatch even when text matches', () => {
    expect(
      isConfidentMatch(anchor, {
        title: 'Thinkin Bout You',
        artist: 'Frank Ocean',
        durationSec: 240,
      }),
    ).toBe(false)
  })

  it('rejects a different song', () => {
    expect(
      isConfidentMatch(anchor, {
        title: 'Pyramids',
        artist: 'Frank Ocean',
        durationSec: 200,
      }),
    ).toBe(false)
  })

  it('matches a dash version suffix against its parenthesized form (Spotify vs Apple)', () => {
    // Spotify titles versions "Title - Version"; Apple titles them "Title (Version)".
    // Spotify-derived anchors carry no duration, so this exercises the strict branch:
    // the candidate's parenthetical content must count toward coverage.
    expect(
      isConfidentMatch(
        { title: 'Crazy - Midnight Mix', artist: 'ICEHOUSE' },
        { title: 'Crazy (Midnight Mix)', artist: 'ICEHOUSE', durationSec: 288 },
      ),
    ).toBe(true)
  })

  it('matches a Spotify remaster dash suffix against the plain Apple title', () => {
    // Apple rarely carries Spotify's remaster year ("Dreams - 2004 Remaster" vs
    // a catalog of "Dreams" / "Dreams (2001 Remaster)"), so the year tokens must
    // not count toward required coverage.
    expect(
      isConfidentMatch(
        { title: 'Dreams - 2004 Remaster', artist: 'Fleetwood Mac' },
        { title: 'Dreams', artist: 'Fleetwood Mac', durationSec: 258 },
      ),
    ).toBe(true)
  })

  it('does not let a live dash suffix match the studio recording', () => {
    expect(
      isConfidentMatch(
        { title: 'Dreams - Live', artist: 'Fleetwood Mac' },
        { title: 'Dreams', artist: 'Fleetwood Mac', durationSec: 258 },
      ),
    ).toBe(false)
  })

  it('rejects a different version behind the parenthetical', () => {
    expect(
      isConfidentMatch(
        { title: 'Crazy - Midnight Mix', artist: 'ICEHOUSE' },
        { title: 'Crazy (Acoustic)', artist: 'ICEHOUSE', durationSec: 288 },
      ),
    ).toBe(false)
  })

  it('requires full token coverage when no durations are available', () => {
    expect(
      isConfidentMatch(
        { title: 'Thinkin Bout You', artist: 'Frank Ocean' },
        { title: 'Frank Ocean - Thinkin Bout You', artist: '' },
      ),
    ).toBe(true)
    expect(
      isConfidentMatch(
        { title: 'Thinkin Bout You', artist: 'Frank Ocean' },
        { title: 'Thinkin Bout', artist: 'Frank Ocean' },
      ),
    ).toBe(false)
  })
})
