import { AtpAgent } from '@atproto/api'

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
        getFollows(params: { actor: string; limit?: number; cursor?: string }): Promise<{
          data: { follows: { did: string }[]; cursor?: string }
        }>
      }
      actor: {
        getProfiles(params: { actors: string[] }): Promise<{
          data: { profiles: { did: string; handle: string; displayName?: string; avatar?: string }[] }
        }>
      }
    }
  }
}

export interface BskyClient {
  getFollows(viewerDid: string): Promise<string[]>
  /** Returns a map of did -> profile (or null when bsky has no profile for that did). */
  getProfiles(dids: string[]): Promise<Map<string, ActorProfile | null>>
}

export interface BskyClientOptions {
  agent?: BskyAgentLike
  now?: () => number
  followsTtlMs?: number
  profileTtlMs?: number
}

const PUBLIC_API = 'https://public.api.bsky.app'

export function createBskyClient(opts: BskyClientOptions = {}): BskyClient {
  const agent: BskyAgentLike = opts.agent ?? new AtpAgent({ service: PUBLIC_API })
  const now = opts.now ?? (() => Date.now())
  const followsTtl = opts.followsTtlMs ?? 60_000
  const profileTtl = opts.profileTtlMs ?? 30 * 60_000

  const followsCache = new Map<string, { at: number; dids: string[] }>()
  const profileCache = new Map<string, { at: number; profile: ActorProfile | null }>()

  return {
    async getFollows(viewerDid) {
      const hit = followsCache.get(viewerDid)
      if (hit && now() - hit.at < followsTtl) return hit.dids
      // No in-flight de-duplication: concurrent cold-cache calls for the same viewer
      // will each paginate independently. Acceptable at MVP scale.
      const dids: string[] = []
      let cursor: string | undefined
      let pages = 0
      const MAX_PAGES = 500 // safety cap (~50k follows) against a non-terminating cursor
      do {
        const res = await agent.app.bsky.graph.getFollows({ actor: viewerDid, limit: 100, cursor })
        for (const f of res.data.follows) dids.push(f.did)
        cursor = res.data.cursor
      } while (cursor && ++pages < MAX_PAGES)
      followsCache.set(viewerDid, { at: now(), dids })
      return dids
    },

    async getProfiles(dids) {
      const result = new Map<string, ActorProfile | null>()
      const misses: string[] = []
      for (const did of dids) {
        const hit = profileCache.get(did)
        if (hit && now() - hit.at < profileTtl) result.set(did, hit.profile)
        else misses.push(did)
      }
      for (let i = 0; i < misses.length; i += 25) {
        const batch = misses.slice(i, i + 25)
        const res = await agent.app.bsky.actor.getProfiles({ actors: batch })
        const found = new Map(res.data.profiles.map((p) => [p.did, p]))
        for (const did of batch) {
          const p = found.get(did)
          const profile: ActorProfile | null = p
            ? { did: p.did, handle: p.handle, displayName: p.displayName, avatar: p.avatar }
            : null
          profileCache.set(did, { at: now(), profile })
          result.set(did, profile)
        }
      }
      return result
    },
  }
}
