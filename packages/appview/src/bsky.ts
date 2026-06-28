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
  /** Returns a map of did -> profile (or null when bsky has no profile for that did). */
  getProfiles(dids: string[]): Promise<Map<string, ActorProfile | null>>
  /** Resolve a single actor (handle or DID) to a profile, or null if not found. */
  getProfile(actor: string): Promise<ActorProfile | null>
}

export interface BskyClientOptions {
  agent?: BskyAgentLike
  profileTtlMs?: number
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
  const profileTtl = opts.profileTtlMs ?? 30 * 60_000

  // The maps these replace were unbounded — every DID/handle ever looked up stayed
  // resident for the life of the long-lived appview process. lru-cache bounds them with
  // TTL expiry (lazy: a stale entry reads as a miss; ttlAutopurge is left off because a
  // timer-per-entry is too costly at this scale) plus LRU eviction.
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
