import { describe, expect, it, vi } from 'vitest'

import { createBskyClient, type BskyAgentLike } from './bsky'

/** Real-time sleep. The TTL tests use short real TTLs + a sleep past them rather than
 *  fake timers: lru-cache measures TTL with its own clock that vitest's fake timers don't
 *  reliably drive, so testing through real time keeps the tests decoupled and robust. */
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

function fakeAgent(
  over: {
    graph?: BskyAgentLike['app']['bsky']['graph']
    actor?: Partial<BskyAgentLike['app']['bsky']['actor']>
  } = {},
): BskyAgentLike {
  return {
    app: {
      bsky: {
        graph: {
          getFollows: vi.fn(
            async ({
              cursor,
            }: {
              actor: string
              limit?: number
              cursor?: string
            }) =>
              cursor
                ? {
                    data: {
                      follows: [{ did: 'did:plc:b' }],
                      cursor: undefined,
                    },
                  }
                : { data: { follows: [{ did: 'did:plc:a' }], cursor: 'next' } },
          ),
          ...over.graph,
        },
        actor: {
          getProfiles: vi.fn(async ({ actors }: { actors: string[] }) => ({
            data: {
              profiles: actors.map((did) => ({
                did,
                handle: `${did}.test`,
                displayName: 'N',
                avatar: 'a.jpg',
              })),
            },
          })),
          getProfile: vi.fn(async ({ actor }: { actor: string }) => ({
            data: {
              did: 'did:plc:resolved',
              handle: actor,
              displayName: 'Resolved',
              avatar: 'a.jpg',
            },
          })),
          ...over.actor,
        },
      },
    },
  }
}

describe('createBskyClient', () => {
  it('getFollows paginates and returns all DIDs, cached within TTL', async () => {
    const agent = fakeAgent()
    const c = createBskyClient({ agent, followsTtlMs: 50 })
    expect(await c.getFollows('did:plc:viewer')).toEqual([
      'did:plc:a',
      'did:plc:b',
    ])
    expect(agent.app.bsky.graph.getFollows).toHaveBeenCalledTimes(2) // two pages
    await c.getFollows('did:plc:viewer') // cached
    expect(agent.app.bsky.graph.getFollows).toHaveBeenCalledTimes(2)
    await sleep(120) // TTL expired
    await c.getFollows('did:plc:viewer')
    expect(agent.app.bsky.graph.getFollows).toHaveBeenCalledTimes(4)
  })

  it('getProfiles batches by 25, caches per DID, negative-caches misses', async () => {
    const agent = fakeAgent({
      actor: {
        getProfiles: vi.fn(async ({ actors }: { actors: string[] }) => ({
          // only return a profile for did:plc:a; did:plc:missing is omitted
          data: {
            profiles: actors
              .filter((d) => d === 'did:plc:a')
              .map((did) => ({ did, handle: 'a.test' })),
          },
        })),
      },
    })
    const c = createBskyClient({ agent })
    const m = await c.getProfiles(['did:plc:a', 'did:plc:missing'])
    expect(m.get('did:plc:a')).toEqual({
      did: 'did:plc:a',
      handle: 'a.test',
      displayName: undefined,
      avatar: undefined,
    })
    expect(m.get('did:plc:missing')).toBeNull()
    await c.getProfiles(['did:plc:a', 'did:plc:missing']) // both cached (hit + negative)
    expect(agent.app.bsky.actor.getProfiles).toHaveBeenCalledTimes(1)
  })

  it('getProfiles chunks >25 actors into multiple calls', async () => {
    const agent = fakeAgent()
    const c = createBskyClient({ agent })
    const dids = Array.from({ length: 30 }, (_, i) => `did:plc:${i}`)
    await c.getProfiles(dids)
    expect(agent.app.bsky.actor.getProfiles).toHaveBeenCalledTimes(2) // 25 + 5
  })

  it('getProfiles re-fetches after the profile TTL expires', async () => {
    const agent = fakeAgent()
    const c = createBskyClient({ agent, profileTtlMs: 50 })
    await c.getProfiles(['did:plc:a'])
    expect(agent.app.bsky.actor.getProfiles).toHaveBeenCalledTimes(1)
    await c.getProfiles(['did:plc:a']) // cached within TTL
    expect(agent.app.bsky.actor.getProfiles).toHaveBeenCalledTimes(1)
    await sleep(120) // TTL expired
    await c.getProfiles(['did:plc:a'])
    expect(agent.app.bsky.actor.getProfiles).toHaveBeenCalledTimes(2)
  })

  it('getProfile resolves an actor (handle or did) to a profile, cached', async () => {
    const agent = fakeAgent()
    const c = createBskyClient({ agent })
    const p = await c.getProfile('ben.bsky.social')
    expect(p).toEqual({
      did: 'did:plc:resolved',
      handle: 'ben.bsky.social',
      displayName: 'Resolved',
      avatar: 'a.jpg',
    })
    await c.getProfile('ben.bsky.social') // cached
    expect(agent.app.bsky.actor.getProfile).toHaveBeenCalledTimes(1)
  })

  it('getProfile re-fetches after the profile TTL expires', async () => {
    const agent = fakeAgent()
    const c = createBskyClient({ agent, profileTtlMs: 50 })
    await c.getProfile('ben.bsky.social')
    expect(agent.app.bsky.actor.getProfile).toHaveBeenCalledTimes(1)
    await sleep(120) // TTL expired
    await c.getProfile('ben.bsky.social')
    expect(agent.app.bsky.actor.getProfile).toHaveBeenCalledTimes(2)
  })

  it('evicts least-recently-used profiles past the cache cap', async () => {
    const agent = fakeAgent()
    // Cap at 2 so a third distinct DID forces eviction.
    const c = createBskyClient({ agent, profileCacheMax: 2 })
    await c.getProfiles(['did:plc:a']) // a
    await c.getProfiles(['did:plc:b']) // a, b
    await c.getProfile('did:plc:a') // touch a → MRU (actorCache, not profileCache)
    await c.getProfiles(['did:plc:c']) // evicts LRU from profileCache (a)
    expect(agent.app.bsky.actor.getProfiles).toHaveBeenCalledTimes(3)
    // 'a' was evicted from profileCache → refetched; 'b' still cached.
    await c.getProfiles(['did:plc:a'])
    expect(agent.app.bsky.actor.getProfiles).toHaveBeenCalledTimes(4)
    await c.getProfiles(['did:plc:c'])
    expect(agent.app.bsky.actor.getProfiles).toHaveBeenCalledTimes(4) // c still cached
  })

  it('getProfile negative-caches a 4xx but rethrows (uncached) a 5xx', async () => {
    const notFound = fakeAgent({
      actor: {
        getProfile: vi.fn(async () => {
          throw Object.assign(new Error('not found'), { status: 400 })
        }),
      },
    })
    const c1 = createBskyClient({ agent: notFound })
    expect(await c1.getProfile('missing.bsky.social')).toBeNull()
    await c1.getProfile('missing.bsky.social') // served from negative cache
    expect(notFound.app.bsky.actor.getProfile).toHaveBeenCalledTimes(1)

    const flaky = fakeAgent({
      actor: {
        getProfile: vi.fn(async () => {
          throw Object.assign(new Error('upstream'), { status: 502 })
        }),
      },
    })
    const c2 = createBskyClient({ agent: flaky })
    await expect(c2.getProfile('ben.bsky.social')).rejects.toThrow('upstream')
    await expect(c2.getProfile('ben.bsky.social')).rejects.toThrow('upstream') // not cached → refetched
    expect(flaky.app.bsky.actor.getProfile).toHaveBeenCalledTimes(2)
  })
})
