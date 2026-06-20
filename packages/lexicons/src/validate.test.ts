import { describe, expect, it } from 'vitest'

import { JAM_NSID, LIKE_NSID, PROFILE_NSID } from './types'
import { validateRecord } from './validate'

const validJam = {
  $type: JAM_NSID,
  sourceUrl: 'https://open.spotify.com/track/abc',
  sourceProvider: 'spotify',
  title: 'Mr. Brightside',
  artist: 'The Killers',
  createdAt: '2026-05-29T12:00:00.000Z',
}

describe('validateRecord (jam)', () => {
  it('accepts a valid jam', () => {
    expect(validateRecord(JAM_NSID, validJam).success).toBe(true)
  })

  it('accepts a jam with optional caption and via', () => {
    const r = {
      ...validJam,
      caption: 'on repeat all week',
      via: { uri: 'at://did:plc:x/fm.onrepeat.jam/123', did: 'did:plc:x' },
    }
    expect(validateRecord(JAM_NSID, r).success).toBe(true)
  })

  it('rejects a jam missing a required field', () => {
    const { sourceUrl, ...rest } = validJam
    expect(validateRecord(JAM_NSID, rest).success).toBe(false)
  })

  it('rejects a caption longer than 140 graphemes', () => {
    const r = { ...validJam, caption: 'x'.repeat(141) }
    expect(validateRecord(JAM_NSID, r).success).toBe(false)
  })
})

describe('validateRecord (like)', () => {
  it('accepts a valid like', () => {
    const like = {
      $type: LIKE_NSID,
      subject: {
        uri: 'at://did:plc:x/fm.onrepeat.jam/123',
        cid: 'bafyreigh2akiscaildchfkqfxldtxpf2aai3bvgqjt52ow2bfzjlf75vna',
      },
      createdAt: '2026-05-29T12:00:00.000Z',
    }
    expect(validateRecord(LIKE_NSID, like).success).toBe(true)
  })

  it('rejects a like with no subject', () => {
    const like = { $type: LIKE_NSID, createdAt: '2026-05-29T12:00:00.000Z' }
    expect(validateRecord(LIKE_NSID, like).success).toBe(false)
  })
})

describe('regression pins (pre-publication)', () => {
  it('accepts a sourceProvider outside knownValues (advisory, open enum)', () => {
    const res = validateRecord(JAM_NSID, {
      $type: JAM_NSID,
      sourceUrl: 'https://example-music.test/track/1',
      sourceProvider: 'futureprovider',
      title: 'T',
      artist: 'A',
      createdAt: '2026-06-10T00:00:00.000Z',
    })
    expect(res.success).toBe(true)
  })

  it('still accepts a legacy jam record carrying the removed isrc field', () => {
    const res = validateRecord(JAM_NSID, {
      $type: JAM_NSID,
      sourceUrl: 'https://open.spotify.com/track/x',
      sourceProvider: 'spotify',
      title: 'T',
      artist: 'A',
      isrc: 'USRC12300001',
      createdAt: '2026-06-10T00:00:00.000Z',
    })
    expect(res.success).toBe(true)
  })

  it('validates a like whose subject is a canonical com.atproto.repo.strongRef', () => {
    const res = validateRecord(LIKE_NSID, {
      $type: LIKE_NSID,
      subject: {
        uri: 'at://did:plc:x/fm.onrepeat.jam/abc',
        cid: 'bafyreigh2akiscaildchfkqfxldtxpf2aai3bvgqjt52ow2bfzjlf75vna',
      },
      createdAt: '2026-06-10T00:00:00.000Z',
    })
    expect(res.success).toBe(true)
  })
})

describe('validateRecord (profile)', () => {
  const base = { $type: PROFILE_NSID, createdAt: '2026-05-29T12:00:00.000Z' }

  it('accepts a profile with a colorTheme', () => {
    expect(
      validateRecord(PROFILE_NSID, { ...base, colorTheme: 'plum' }).success,
    ).toBe(true)
  })

  it('accepts a profile with no colorTheme (optional)', () => {
    expect(validateRecord(PROFILE_NSID, base).success).toBe(true)
  })

  it('rejects a colorTheme longer than 64 chars', () => {
    const r = { ...base, colorTheme: 'x'.repeat(65) }
    expect(validateRecord(PROFILE_NSID, r).success).toBe(false)
  })
})
