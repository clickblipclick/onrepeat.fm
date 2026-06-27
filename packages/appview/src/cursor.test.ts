import { describe, expect, it } from 'vitest'

import { decodeCursor, encodeCursor } from './cursor'

describe('cursor', () => {
  it('round-trips createdAt + uri', () => {
    const c = encodeCursor({
      createdAt: '2026-05-30T00:00:00.000Z',
      uri: 'at://did:plc:x/fm.onrepeat.feed.jam/1',
    })
    expect(typeof c).toBe('string')
    expect(decodeCursor(c)).toEqual({
      createdAt: '2026-05-30T00:00:00.000Z',
      uri: 'at://did:plc:x/fm.onrepeat.feed.jam/1',
    })
  })

  it('throws on a malformed cursor', () => {
    expect(() => decodeCursor('not-base64-$$$')).toThrow()
    expect(() =>
      decodeCursor(Buffer.from('nopipe').toString('base64url')),
    ).toThrow()
  })

  it('round-trips a uri containing a pipe (splits on first | only)', () => {
    const uri = 'at://did:plc:x/fm.onrepeat.feed.jam/pipe|test'
    const c = encodeCursor({ createdAt: '2026-05-30T00:00:00.000Z', uri })
    expect(decodeCursor(c)).toEqual({
      createdAt: '2026-05-30T00:00:00.000Z',
      uri,
    })
  })

  it('round-trips an optional snapshot timestamp', () => {
    const c = encodeCursor({
      createdAt: '2026-05-30T00:00:00.000Z',
      uri: 'at://did:plc:x/fm.onrepeat.feed.jam/1',
      snap: '2026-05-30T00:05:00.000Z',
    })
    expect(decodeCursor(c)).toEqual({
      createdAt: '2026-05-30T00:00:00.000Z',
      uri: 'at://did:plc:x/fm.onrepeat.feed.jam/1',
      snap: '2026-05-30T00:05:00.000Z',
    })
  })
})
