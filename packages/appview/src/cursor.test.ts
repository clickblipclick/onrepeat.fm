import { describe, it, expect } from 'vitest'
import { encodeCursor, decodeCursor } from './cursor'

describe('cursor', () => {
  it('round-trips createdAt + uri', () => {
    const c = encodeCursor({ createdAt: '2026-05-30T00:00:00.000Z', uri: 'at://did:plc:x/fm.onrepeat.jam/1' })
    expect(typeof c).toBe('string')
    expect(decodeCursor(c)).toEqual({ createdAt: '2026-05-30T00:00:00.000Z', uri: 'at://did:plc:x/fm.onrepeat.jam/1' })
  })

  it('throws on a malformed cursor', () => {
    expect(() => decodeCursor('not-base64-$$$')).toThrow()
    expect(() => decodeCursor(Buffer.from('nopipe').toString('base64url'))).toThrow()
  })

  it('round-trips a uri containing a pipe (splits on first | only)', () => {
    const uri = 'at://did:plc:x/fm.onrepeat.jam/pipe|test'
    const c = encodeCursor({ createdAt: '2026-05-30T00:00:00.000Z', uri })
    expect(decodeCursor(c)).toEqual({ createdAt: '2026-05-30T00:00:00.000Z', uri })
  })
})
