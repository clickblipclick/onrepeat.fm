import { describe, it, expect } from 'vitest'
import { isConfidentMatch, normalizeTokens } from './match'

describe('normalizeTokens', () => {
  it('lowercases, strips parentheticals/feat/punctuation', () => {
    expect(normalizeTokens('Thinkin Bout You (Remastered 2009)')).toEqual(['thinkin', 'bout', 'you'])
    expect(normalizeTokens('Song feat. Someone')).toEqual(['song'])
    expect(normalizeTokens('A-Punk!')).toEqual(['a', 'punk'])
  })
})

describe('isConfidentMatch', () => {
  const anchor = { title: 'Thinkin Bout You', artist: 'Frank Ocean', durationSec: 200 }

  it('matches an exact Spotify-style candidate', () => {
    expect(isConfidentMatch(anchor, { title: 'Thinkin Bout You', artist: 'Frank Ocean', durationSec: 201 })).toBe(true)
  })

  it('matches a YouTube-style title that embeds artist + decorations (with close duration)', () => {
    expect(isConfidentMatch(anchor, { title: 'Frank Ocean - Thinkin Bout You (Official Audio)', artist: 'FrankOceanVEVO', durationSec: 202 })).toBe(true)
  })

  it('rejects a duration mismatch even when text matches', () => {
    expect(isConfidentMatch(anchor, { title: 'Thinkin Bout You', artist: 'Frank Ocean', durationSec: 240 })).toBe(false)
  })

  it('rejects a different song', () => {
    expect(isConfidentMatch(anchor, { title: 'Pyramids', artist: 'Frank Ocean', durationSec: 200 })).toBe(false)
  })

  it('requires full token coverage when no durations are available', () => {
    expect(isConfidentMatch({ title: 'Thinkin Bout You', artist: 'Frank Ocean' }, { title: 'Frank Ocean - Thinkin Bout You', artist: '' })).toBe(true)
    expect(isConfidentMatch({ title: 'Thinkin Bout You', artist: 'Frank Ocean' }, { title: 'Thinkin Bout', artist: 'Frank Ocean' })).toBe(false)
  })
})
