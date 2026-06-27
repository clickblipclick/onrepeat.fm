import { describe, expect, it } from 'vitest'

import { didFromUri, rkeyFromUri } from './at-uri'

describe('didFromUri', () => {
  it('extracts the DID authority from an at-uri', () => {
    expect(didFromUri('at://did:plc:abc/fm.onrepeat.feed.jam/xyz')).toBe(
      'did:plc:abc',
    )
  })
  it('returns empty string for an empty input', () => {
    expect(didFromUri('')).toBe('')
  })
})

describe('rkeyFromUri', () => {
  it('extracts the rkey (last path segment)', () => {
    expect(rkeyFromUri('at://did:plc:abc/fm.onrepeat.feed.jam/xyz')).toBe('xyz')
  })
  it('tolerates a trailing slash', () => {
    expect(rkeyFromUri('at://did:plc:abc/fm.onrepeat.feed.jam/xyz/')).toBe(
      'xyz',
    )
  })
  it('returns empty string for an empty input', () => {
    expect(rkeyFromUri('')).toBe('')
  })
})
