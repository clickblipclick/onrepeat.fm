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
