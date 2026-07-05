import {
  createBskyClient,
  getCachedProfiles,
  hydrateAuthors,
  loadActorProfiles,
  loadActorThemes,
  type ActorProfile,
  type HydratedJamView,
  type JamView,
  type NotificationView,
} from '@onrepeat/appview'
import { upsertActorProfiles } from '@onrepeat/db'

import { db } from './db'

const globalForBsky = globalThis as unknown as {
  __onrepeatBsky?: ReturnType<typeof createBskyClient>
}
export const bsky = globalForBsky.__onrepeatBsky ?? createBskyClient()
if (process.env.NODE_ENV !== 'production') globalForBsky.__onrepeatBsky = bsky

/**
 * Resolve profiles for a set of DIDs through the DB write-through cache (24h TTL): serve
 * fresh rows from our index, fetch only stale/missing DIDs from bsky, write them through,
 * and fall back to last-known rows on a bsky outage. Never throws.
 */
export function cachedProfiles(
  dids: string[],
): Promise<Map<string, ActorProfile | null>> {
  return getCachedProfiles(
    {
      load: (d) => loadActorProfiles(db, d),
      fetch: (d) => bsky.getProfiles(d),
      save: (entries, at) => upsertActorProfiles(db, entries, at),
    },
    dids,
  )
}

export type HydratedNotification = NotificationView & {
  /** The person who liked/reposted; DID-only when their profile can't be resolved. */
  actor: { did: string; handle?: string; displayName?: string; avatar?: string }
}

/** Attach actor profiles to notifications via the DB write-through cache. Same
 *  degradation contract as `hydrate`: a profile failure yields DID-only actors,
 *  never a failed page. */
export async function hydrateNotifications(
  items: NotificationView[],
): Promise<HydratedNotification[]> {
  const dids = Array.from(new Set(items.map((i) => i.actorDid)))
  let profiles = new Map<string, ActorProfile | null>()
  try {
    profiles = await cachedProfiles(dids)
  } catch (err) {
    console.error(
      '[web] notification hydration failed; serving DID-only actors',
      err,
    )
  }
  return items.map((i) => {
    const p = profiles.get(i.actorDid)
    return {
      ...i,
      actor: p
        ? {
            did: p.did,
            handle: p.handle,
            displayName: p.displayName,
            avatar: p.avatar,
          }
        : { did: i.actorDid },
    }
  })
}

/**
 * Hydrate a list of views' authors via the shared (cached) bsky client.
 * Hydration is enrichment, never required: if the bsky profile lookup fails
 * (network / rate-limit / outage), degrade to DID-only authors rather than
 * failing the page (per design spec §8).
 */
export async function hydrate(jams: JamView[]): Promise<HydratedJamView[]> {
  // Resolve the jam author and, for re-jams, the original (`via`) author in one batch.
  const dids = new Set<string>()
  for (const j of jams) {
    dids.add(j.authorDid)
    if (j.via) dids.add(j.via.did)
  }
  // Themes come from our own index (cheap, local): load them regardless of whether the
  // upstream bsky profile lookup succeeds, so author cards stay themed even on a bsky outage.
  const themes = await loadActorThemes(db, [...dids]).catch(() => new Map())
  // Profiles come from the DB write-through cache (bsky behind a 24h TTL). getCachedProfiles
  // already degrades internally (bsky outage → last-known row, unknown DID → null) and never
  // throws, but keep the try/catch as a belt-and-suspenders backstop so hydration can never
  // fail a page.
  try {
    const profiles = await cachedProfiles([...dids])
    return hydrateAuthors(jams, profiles, themes)
  } catch (err) {
    console.error(
      '[web] profile hydration failed; serving DID-only authors',
      err,
    )
    return hydrateAuthors(jams, new Map(), themes)
  }
}
