import { describe, it, expect } from 'vitest'
import { deriveTrack } from './track'
import type { OdesliClient } from './odesli'

const fakeOdesli = (over: Partial<Awaited<ReturnType<OdesliClient['resolve']>>>): OdesliClient => ({
  resolve: async () => ({ notFound: false, providerRefs: {}, ...over }),
})

describe('deriveTrack', () => {
  it('maps an Odesli hit to a TrackCandidate', async () => {
    const c = await deriveTrack('https://open.spotify.com/track/abc', fakeOdesli({ title: 'Teardrop', artist: 'Massive Attack', artworkUrl: 'art.jpg' }))
    expect(c).toEqual({ title: 'Teardrop', artist: 'Massive Attack', artworkUrl: 'art.jpg', sourceUrl: 'https://open.spotify.com/track/abc', provider: 'spotify' })
  })
  it('returns null when Odesli has no match', async () => {
    expect(await deriveTrack('https://x/y', fakeOdesli({ notFound: true }))).toBeNull()
  })
  it('returns null when Odesli returns no title', async () => {
    expect(await deriveTrack('https://x/y', fakeOdesli({ artist: 'A' }))).toBeNull()
  })
})
