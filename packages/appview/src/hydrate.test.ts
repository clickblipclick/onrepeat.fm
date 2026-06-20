import { describe, expect, it } from 'vitest'

import { defaultThemeForDid } from '@onrepeat/core'

import type { ActorProfile } from './bsky'
import { hydrateAuthors } from './hydrate'
import type { JamView } from './read'

function jam(uri: string, authorDid: string): JamView {
  return {
    uri,
    cid: 'c',
    authorDid,
    createdAt: '2026-05-30T00:00:00.000Z',
    caption: null,
    title: 'T',
    artist: 'A',
    artworkUrl: null,
    sourceUrl: 'u',
    sourceProvider: 'spotify',
    providerRefs: {},
    resolutionStatus: null,
    likeCount: 0,
    likedByYou: false,
    via: null,
  }
}

describe('hydrateAuthors', () => {
  it('attaches profiles; missing DIDs become a DID-only author', () => {
    const profiles = new Map<string, ActorProfile | null>([
      [
        'did:plc:a',
        {
          did: 'did:plc:a',
          handle: 'a.test',
          displayName: 'Ay',
          avatar: 'av.jpg',
        },
      ],
      ['did:plc:b', null],
    ])
    const out = hydrateAuthors(
      [
        jam('at://x/1', 'did:plc:a'),
        jam('at://x/2', 'did:plc:b'),
        jam('at://x/3', 'did:plc:c'),
      ],
      profiles,
    )
    expect(out[0]!.author).toEqual({
      did: 'did:plc:a',
      handle: 'a.test',
      displayName: 'Ay',
      avatar: 'av.jpg',
      theme: defaultThemeForDid('did:plc:a'), // no themes map → deterministic default
    })
    expect(out[1]!.author).toEqual({
      did: 'did:plc:b',
      theme: defaultThemeForDid('did:plc:b'),
    }) // negative-cached → DID only
    expect(out[2]!.author).toEqual({
      did: 'did:plc:c',
      theme: defaultThemeForDid('did:plc:c'),
    }) // absent from map → DID only
  })

  it('attaches viaAuthor for a re-jam; null when not a re-jam', () => {
    const profiles = new Map<string, ActorProfile | null>([
      [
        'did:plc:o',
        { did: 'did:plc:o', handle: 'orig.test', displayName: 'Orig' },
      ],
    ])
    const reJam: JamView = {
      ...jam('at://x/1', 'did:plc:a'),
      via: { uri: 'at://did:plc:o/fm.onrepeat.jam/9', did: 'did:plc:o' },
    }
    const out = hydrateAuthors([reJam, jam('at://x/2', 'did:plc:a')], profiles)
    expect(out[0]!.viaAuthor).toEqual({
      did: 'did:plc:o',
      handle: 'orig.test',
      displayName: 'Orig',
      theme: defaultThemeForDid('did:plc:o'),
    })
    expect(out[1]!.viaAuthor).toBeNull()
  })

  it('uses a stored theme when present and falls back to the DID default otherwise', () => {
    const profiles = new Map<string, ActorProfile | null>()
    const themes = new Map<string, string | null>([
      ['did:plc:a', 'plum'], // explicit choice
      ['did:plc:b', null], // seen but unset
      ['did:plc:c', 'bogus'], // junk/unknown slug
    ])
    const out = hydrateAuthors(
      [
        jam('at://x/1', 'did:plc:a'),
        jam('at://x/2', 'did:plc:b'),
        jam('at://x/3', 'did:plc:c'),
      ],
      profiles,
      themes,
    )
    expect(out[0]!.author.theme).toBe('plum')
    expect(out[1]!.author.theme).toBe(defaultThemeForDid('did:plc:b'))
    expect(out[2]!.author.theme).toBe(defaultThemeForDid('did:plc:c'))
  })

  it('returns an empty array for empty input', () => {
    const profiles = new Map()
    expect(hydrateAuthors([], profiles)).toEqual([])
  })
})
