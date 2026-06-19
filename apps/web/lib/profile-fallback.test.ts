import { describe, it, expect } from 'vitest'
import { profileOrDidFallback } from './profile-fallback'
import type { ActorProfile } from '@onrepeat/appview'

const real: ActorProfile = {
  did: 'did:plc:abc',
  handle: 'alice.bsky.social',
  displayName: 'Alice',
  avatar: 'https://cdn/av.jpg',
}

describe('profileOrDidFallback', () => {
  it('returns the bsky profile unchanged when present', () => {
    expect(profileOrDidFallback('alice.bsky.social', real)).toBe(real)
  })

  it('falls back to a DID-only profile when bsky has none and the actor is a DID', () => {
    expect(profileOrDidFallback('did:plc:abc', null)).toEqual({
      did: 'did:plc:abc',
      handle: 'did:plc:abc',
    })
  })

  it('returns null when bsky has none and the actor is a handle (unresolvable without bsky)', () => {
    expect(profileOrDidFallback('alice.bsky.social', null)).toBeNull()
  })
})
