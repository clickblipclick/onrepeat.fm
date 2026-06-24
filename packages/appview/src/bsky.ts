import { AtpAgent } from '@atproto/api'
import { LRUCache } from 'lru-cache'

export interface ActorProfile {
  did: string
  handle: string
  displayName?: string
  avatar?: string
}

/** The slice of an AtpAgent we use — narrowed so tests can supply a fake. */
export interface BskyAgentLike {
  app: {
    bsky: {
      graph: {
        getFollows(params: {
          actor: string
          limit?: number
          cursor?: string
        }): Promise<{
          data: { follows: { did: string }[]; cursor?: string }
        }>
      }
      actor: {
        getProfiles(params: { actors: string[] }): Promise<{
          data: {
            profiles: {
              did: string
              handle: string
              displayName?: string
              avatar?: string
            }[]
          }
        }>
        getProfile(params: { actor: string }): Promise<{
          data: {
            did: string
            handle: string
            displayName?: string
            avatar?: string
          }
        }>
      }
    }
  }
}

export interface BskyClient {
  getFollows(viewerDid: string): Promise<string[]>
  /** Returns a map of did -> profile (or null when bsky has no profile for that did). */
  getProfiles(dids: string[]): Promise<Map<string, ActorProfile | null>>
  /** Resolve a single actor (handle or DID) to a profile, or null if not found. */
  getProfile(actor: string): Promise<ActorProfile | null>
}

export interface BskyClientOptions {
  agent?: BskyAgentLike
  followsTtlMs?: number
  profileTtlMs?: number
  /** Memory bound for the follows cache, measured in total cached DIDs across all
   *  follow-lists (a single list can hold ~50k) rather than entry count, since an
   *  entry cap is a poor proxy for memory here. Default 500_000. */
  followsCacheMaxSize?: number
  /** Max cached profiles (small fixed-size objects) before LRU eviction. Default 50_000. */
  profileCacheMax?: number
}

/** lru-cache's value type must be non-nullish, so wrap the profile — a `null` profile is
 *  a valid negative-cache hit (bsky has no profile for the DID), distinct from a miss
 *  (no entry / expired), which surfaces as `undefined` from `get()`. */
interface CachedProfile {
  profile: ActorProfile | null
}

const PUBLIC_API = 'https://public.api.bsky.app'

export function createBskyClient(opts: BskyClientOptions = {}): BskyClient {
  const agent: BskyAgentLike =
    opts.agent ?? new AtpAgent({ service: PUBLIC_API })
  const followsTtl = opts.followsTtlMs ?? 60_000
  const profileTtl = opts.profileTtlMs ?? 30 * 60_000

  // The maps these replace were unbounded — every DID/handle ever looked up stayed
  // resident for the life of the long-lived appview process. lru-cache bounds them with
  // TTL expiry (lazy: a stale entry reads as a miss; ttlAutopurge is left off because a
  // timer-per-entry is too costly at this scale) plus LRU eviction.
  //
  // Follow-lists are bounded by total cached DIDs (maxSize), not entry count: one list
  // can hold ~50k DIDs (the MAX_PAGES cap below), so a flat entry cap would be a poor
  // memory proxy. Default maxSize leaves ~10x headroom over a single max-size list.
  const followsCache = new LRUCache<string, string[]>({
    ttl: followsTtl,
    maxSize: opts.followsCacheMaxSize ?? 500_000,
    sizeCalculation: (dids) => Math.max(1, dids.length),
  })
  const profileCache = new LRUCache<string, CachedProfile>({
    ttl: profileTtl,
    max: opts.profileCacheMax ?? 50_000,
  })
  // Separate from profileCache: getProfile keys by the raw actor string (handle or DID);
  // getProfiles keys by resolved DID. Cross-population is intentionally deferred (MVP).
  const actorCache = new LRUCache<string, CachedProfile>({
    ttl: profileTtl,
    max: opts.profileCacheMax ?? 50_000,
  })

  return {
    async getFollows(viewerDid) {
      const hit = followsCache.get(viewerDid)
      if (hit !== undefined) return hit
      // No in-flight de-duplication: concurrent cold-cache calls for the same viewer
      // will each paginate independently. Acceptable at MVP scale.
      const dids: string[] = []
      let cursor: string | undefined
      let pages = 0
      const MAX_PAGES = 500 // safety cap (~50k follows) against a non-terminating cursor
      do {
        const res = await agent.app.bsky.graph.getFollows({
          actor: viewerDid,
          limit: 100,
          cursor,
        })
        for (const f of res.data.follows) dids.push(f.did)
        cursor = res.data.cursor
      } while (cursor && ++pages < MAX_PAGES)
      followsCache.set(viewerDid, dids)
      return dids
    },

    async getProfiles(dids) {
      const result = new Map<string, ActorProfile | null>()
      const misses: string[] = []
      for (const did of dids) {
        const hit = profileCache.get(did)
        if (hit) result.set(did, hit.profile)
        else misses.push(did)
      }
      for (let i = 0; i < misses.length; i += 25) {
        const batch = misses.slice(i, i + 25)
        const res = await agent.app.bsky.actor.getProfiles({ actors: batch })
        const found = new Map(res.data.profiles.map((p) => [p.did, p]))
        for (const did of batch) {
          const p = found.get(did)
          const profile: ActorProfile | null = p
            ? {
                did: p.did,
                handle: p.handle,
                displayName: p.displayName,
                avatar: p.avatar,
              }
            : null
          profileCache.set(did, { profile })
          result.set(did, profile)
        }
      }
      return result
    },

    async getProfile(actor) {
      const hit = actorCache.get(actor)
      if (hit) return hit.profile
      try {
        const res = await agent.app.bsky.actor.getProfile({ actor })
        const p = res.data
        const profile: ActorProfile = {
          did: p.did,
          handle: p.handle,
          displayName: p.displayName,
          avatar: p.avatar,
        }
        actorCache.set(actor, { profile })
        return profile
      } catch (err) {
        // Negative-cache only genuine client errors (unknown/invalid actor → 4xx);
        // let transient 5xx/network errors propagate uncached so the next load retries
        // (don't pin a 404 for the whole TTL after an upstream blip).
        const status = (err as { status?: number } | undefined)?.status
        if (typeof status === 'number' && status >= 400 && status < 500) {
          actorCache.set(actor, { profile: null })
          return null
        }
        throw err
      }
    },
  }
}
