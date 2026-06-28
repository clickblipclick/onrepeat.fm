import { describe, expect, it } from 'vitest'

import {
  FOLLOW_NSID,
  JAM_NSID,
  LIKE_NSID,
  PROFILE_NSID,
  validateRecord,
} from '@onrepeat/lexicons'

import {
  buildFollowRecord,
  buildJamRecord,
  buildLikeRecord,
  buildProfileRecord,
} from './records'

const baseJam = {
  sourceUrl: 'https://open.spotify.com/track/abc',
  sourceProvider: 'spotify',
  title: 'Mr. Brightside',
  artist: 'The Killers',
}

describe('buildJamRecord', () => {
  it('builds a valid jam with $type and a createdAt default', () => {
    const r = buildJamRecord(baseJam)
    expect(r.$type).toBe(JAM_NSID)
    expect(typeof r.createdAt).toBe('string')
    expect(validateRecord(JAM_NSID, r).success).toBe(true)
  })

  it('includes optional caption and via when provided', () => {
    const r = buildJamRecord({
      ...baseJam,
      caption: 'x',
      via: {
        uri: 'at://did:plc:x/fm.onrepeat.feed.jam/1',
        cid: 'bafyreigh2akiscaildchfkqfxldtxpf2aai3bvgqjt52ow2bfzjlf75vna',
      },
    })
    expect(r.via).toEqual({
      uri: 'at://did:plc:x/fm.onrepeat.feed.jam/1',
      cid: 'bafyreigh2akiscaildchfkqfxldtxpf2aai3bvgqjt52ow2bfzjlf75vna',
    })
  })

  it('omits optional fields that were not provided', () => {
    const r = buildJamRecord(baseJam)
    expect('caption' in r).toBe(false)
    expect('via' in r).toBe(false)
    expect('artworkUrl' in r).toBe(false)
  })

  it('throws when the built record would be invalid (caption too long)', () => {
    expect(() =>
      buildJamRecord({ ...baseJam, caption: 'x'.repeat(141) }),
    ).toThrow(/invalid jam/i)
  })
})

describe('buildLikeRecord', () => {
  it('builds a valid like pointing at a jam strongRef', () => {
    const r = buildLikeRecord({
      uri: 'at://did:plc:x/fm.onrepeat.feed.jam/1',
      cid: 'bafyreigh2akiscaildchfkqfxldtxpf2aai3bvgqjt52ow2bfzjlf75vna',
    })
    expect(r.$type).toBe(LIKE_NSID)
    expect(validateRecord(LIKE_NSID, r).success).toBe(true)
  })
})

describe('buildProfileRecord', () => {
  it('builds a valid profile with $type, colorTheme, and a createdAt default', () => {
    const r = buildProfileRecord({ colorTheme: 'plum' })
    expect(r.$type).toBe(PROFILE_NSID)
    expect(r.colorTheme).toBe('plum')
    expect(typeof r.createdAt).toBe('string')
    expect(validateRecord(PROFILE_NSID, r).success).toBe(true)
  })

  it('omits colorTheme when not provided (still valid)', () => {
    const r = buildProfileRecord({})
    expect('colorTheme' in r).toBe(false)
    expect(validateRecord(PROFILE_NSID, r).success).toBe(true)
  })

  it('throws when the built record would be invalid (colorTheme too long)', () => {
    expect(() => buildProfileRecord({ colorTheme: 'x'.repeat(65) })).toThrow(
      /invalid profile/i,
    )
  })
})

describe('buildFollowRecord', () => {
  it('builds a valid follow record', () => {
    const r = buildFollowRecord('did:plc:abc', '2026-06-27T00:00:00.000Z')
    expect(r).toEqual({
      $type: FOLLOW_NSID,
      subject: 'did:plc:abc',
      createdAt: '2026-06-27T00:00:00.000Z',
    })
  })

  it('throws on a non-DID subject', () => {
    expect(() => buildFollowRecord('nope')).toThrow(/invalid follow/)
  })
})
