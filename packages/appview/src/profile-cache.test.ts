import { describe, expect, it, vi } from 'vitest'

import type { ActorProfile } from './bsky'
import { getCachedProfiles, type ProfileCacheDeps } from './profile-cache'
import type { CachedActorProfile } from './read'

const TTL = 24 * 60 * 60 * 1000
const NOW = 1_000_000_000_000 // fixed clock (ms)

function prof(did: string): ActorProfile {
  return { did, handle: `${did}.test`, displayName: 'N', avatar: 'a.jpg' }
}

function deps(
  over: Partial<ProfileCacheDeps> & {
    cache?: Map<string, CachedActorProfile>
  } = {},
): ProfileCacheDeps & {
  fetch: ReturnType<typeof vi.fn>
  save: ReturnType<typeof vi.fn>
} {
  const cache = over.cache ?? new Map()
  return {
    load: over.load ?? vi.fn(async () => cache),
    fetch:
      (over.fetch as ReturnType<typeof vi.fn>) ??
      vi.fn(async (dids: string[]) => new Map(dids.map((d) => [d, prof(d)]))),
    save: (over.save as ReturnType<typeof vi.fn>) ?? vi.fn(async () => {}),
    ttlMs: over.ttlMs ?? TTL,
    now: over.now ?? (() => NOW),
  }
}

describe('getCachedProfiles', () => {
  it('serves a fresh cache hit without calling bsky', async () => {
    const cache = new Map<string, CachedActorProfile>([
      [
        'did:plc:a',
        { profile: prof('did:plc:a'), updatedAt: new Date(NOW - 1000) },
      ],
    ])
    const d = deps({ cache })
    const out = await getCachedProfiles(d, ['did:plc:a'])
    expect(out.get('did:plc:a')).toEqual(prof('did:plc:a'))
    expect(d.fetch).not.toHaveBeenCalled()
    expect(d.save).not.toHaveBeenCalled()
  })

  it('serves a fresh negative cache hit (null) without calling bsky', async () => {
    const cache = new Map<string, CachedActorProfile>([
      ['did:plc:b', { profile: null, updatedAt: new Date(NOW - 1000) }],
    ])
    const d = deps({ cache })
    const out = await getCachedProfiles(d, ['did:plc:b'])
    expect(out.get('did:plc:b')).toBeNull()
    expect(d.fetch).not.toHaveBeenCalled()
  })

  it('refetches a stale row and write-throughs the result', async () => {
    const cache = new Map<string, CachedActorProfile>([
      [
        'did:plc:a',
        { profile: prof('did:plc:a'), updatedAt: new Date(NOW - TTL - 1) },
      ],
    ])
    const d = deps({ cache })
    const out = await getCachedProfiles(d, ['did:plc:a'])
    expect(d.fetch).toHaveBeenCalledWith(['did:plc:a'])
    expect(out.get('did:plc:a')).toEqual(prof('did:plc:a'))
    expect(d.save).toHaveBeenCalledWith(
      [{ did: 'did:plc:a', profile: prof('did:plc:a') }],
      new Date(NOW),
    )
  })

  it('fetches a missing DID (not in cache)', async () => {
    const d = deps()
    const out = await getCachedProfiles(d, ['did:plc:x'])
    expect(d.fetch).toHaveBeenCalledWith(['did:plc:x'])
    expect(out.get('did:plc:x')).toEqual(prof('did:plc:x'))
  })

  it('stores a fetched negative (bsky returns null) as a null write-through entry', async () => {
    const d = deps({ fetch: vi.fn(async () => new Map([['did:plc:x', null]])) })
    const out = await getCachedProfiles(d, ['did:plc:x'])
    expect(out.get('did:plc:x')).toBeNull()
    expect(d.save).toHaveBeenCalledWith(
      [{ did: 'did:plc:x', profile: null }],
      new Date(NOW),
    )
  })

  it('falls back to a stale row when bsky is down (does not save)', async () => {
    const cache = new Map<string, CachedActorProfile>([
      [
        'did:plc:a',
        { profile: prof('did:plc:a'), updatedAt: new Date(NOW - TTL - 1) },
      ],
    ])
    const d = deps({
      cache,
      fetch: vi.fn(async () => {
        throw new Error('bsky down')
      }),
    })
    const out = await getCachedProfiles(d, ['did:plc:a'])
    expect(out.get('did:plc:a')).toEqual(prof('did:plc:a'))
    expect(d.save).not.toHaveBeenCalled()
  })

  it('returns null for a missing DID when bsky is down and no row exists', async () => {
    const d = deps({
      fetch: vi.fn(async () => {
        throw new Error('bsky down')
      }),
    })
    const out = await getCachedProfiles(d, ['did:plc:x'])
    expect(out.get('did:plc:x')).toBeNull()
  })

  it('is empty-safe', async () => {
    const d = deps()
    expect((await getCachedProfiles(d, [])).size).toBe(0)
    expect(d.load).not.toHaveBeenCalled()
  })

  it('mixes a fresh cache hit with a stale refetch in one call', async () => {
    const cache = new Map<string, CachedActorProfile>([
      [
        'did:plc:fresh',
        { profile: prof('did:plc:fresh'), updatedAt: new Date(NOW - 1000) },
      ],
      [
        'did:plc:stale',
        { profile: prof('did:plc:stale'), updatedAt: new Date(NOW - TTL - 1) },
      ],
    ])
    const d = deps({ cache })
    const out = await getCachedProfiles(d, ['did:plc:fresh', 'did:plc:stale'])
    // only the stale DID is fetched + written through
    expect(d.fetch).toHaveBeenCalledWith(['did:plc:stale'])
    expect(d.save).toHaveBeenCalledWith(
      [{ did: 'did:plc:stale', profile: prof('did:plc:stale') }],
      new Date(NOW),
    )
    expect(out.get('did:plc:fresh')).toEqual(prof('did:plc:fresh'))
    expect(out.get('did:plc:stale')).toEqual(prof('did:plc:stale'))
  })

  it('treats every DID as stale when the cache load throws (best-effort)', async () => {
    const d = deps({
      load: vi.fn(async () => {
        throw new Error('db down')
      }),
    })
    const out = await getCachedProfiles(d, ['did:plc:a', 'did:plc:b'])
    expect(d.fetch).toHaveBeenCalledWith(['did:plc:a', 'did:plc:b'])
    expect(out.get('did:plc:a')).toEqual(prof('did:plc:a'))
    expect(out.get('did:plc:b')).toEqual(prof('did:plc:b'))
  })
})
