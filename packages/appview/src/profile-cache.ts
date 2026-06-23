import type { ActorProfile } from './bsky'
import type { CachedActorProfile } from './read'

/** Injected dependencies for the profile cache. Production wiring builds these from the db
 *  pool + bsky client (see apps/web/lib/appview.ts); tests pass fakes. */
export interface ProfileCacheDeps {
  /** Read cached rows for these DIDs from our index. */
  load: (dids: string[]) => Promise<Map<string, CachedActorProfile>>
  /** Fetch fresh profiles from bsky (e.g. bsky.getProfiles). Null = bsky has no profile. */
  fetch: (dids: string[]) => Promise<Map<string, ActorProfile | null>>
  /** Write-through the fetched results (positives and negatives) with a freshness stamp. */
  save: (
    entries: Array<{ did: string; profile: ActorProfile | null }>,
    updatedAt: Date,
  ) => Promise<void>
  /** Cache TTL in ms. Default 24h (Bluesky's recommended max for identity metadata). */
  ttlMs?: number
  /** Clock injection for tests; production omits it (defaults to Date.now). */
  now?: () => number
}

const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000

/**
 * Resolve profiles for a set of DIDs through the DB write-through cache:
 *   1. Load cached rows (best-effort — a DB failure just treats everything as stale).
 *   2. Serve rows fresh within the TTL directly (including cached negatives → null).
 *   3. Fetch the stale/missing DIDs from bsky, then write them through (positives + negatives).
 *   4. If bsky fails, fall back to the last-known stale row; DIDs with no row → null.
 * Never throws: degrades to null (→ DID-only author downstream). Empty-safe.
 */
export async function getCachedProfiles(
  deps: ProfileCacheDeps,
  dids: string[],
): Promise<Map<string, ActorProfile | null>> {
  const result = new Map<string, ActorProfile | null>()
  if (dids.length === 0) return result

  const uniqueDids = [...new Set(dids)]
  const ttl = deps.ttlMs ?? DEFAULT_TTL_MS
  const nowMs = (deps.now ?? (() => Date.now()))()

  let cache: Map<string, CachedActorProfile> = new Map()
  try {
    cache = await deps.load(uniqueDids)
  } catch (err) {
    console.error(
      '[appview] profile cache load failed; treating all as stale',
      err,
    )
  }

  const stale: string[] = []
  for (const did of uniqueDids) {
    const hit = cache.get(did)
    if (hit && hit.updatedAt && nowMs - hit.updatedAt.getTime() < ttl) {
      result.set(did, hit.profile) // fresh (positive or cached negative)
    } else {
      stale.push(did)
    }
  }
  if (stale.length === 0) return result

  let fetched: Map<string, ActorProfile | null> | null = null
  try {
    fetched = await deps.fetch(stale)
  } catch (err) {
    console.error(
      '[appview] profile fetch failed; falling back to cached rows',
      err,
    )
  }

  if (fetched) {
    const entries: Array<{ did: string; profile: ActorProfile | null }> = []
    for (const did of stale) {
      const profile = fetched.get(did) ?? null
      result.set(did, profile)
      entries.push({ did, profile })
    }
    try {
      await deps.save(entries, new Date(nowMs))
    } catch (err) {
      console.error('[appview] profile cache save failed', err)
    }
  } else {
    // bsky unreachable → serve last-known stale rows; unknown DIDs degrade to null.
    for (const did of stale) {
      const hit = cache.get(did)
      result.set(did, hit ? hit.profile : null)
    }
  }
  return result
}
