import {
  createBskyClient,
  hydrateAuthors,
  loadActorThemes,
  type HydratedJamView,
  type JamView,
} from '@onrepeat/appview'

import { db } from './db'

const globalForBsky = globalThis as unknown as {
  __onrepeatBsky?: ReturnType<typeof createBskyClient>
}
export const bsky = globalForBsky.__onrepeatBsky ?? createBskyClient()
if (process.env.NODE_ENV !== 'production') globalForBsky.__onrepeatBsky = bsky

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
  try {
    const profiles = await bsky.getProfiles([...dids])
    return hydrateAuthors(jams, profiles, themes)
  } catch (err) {
    console.error(
      '[web] profile hydration failed; serving DID-only authors',
      err,
    )
    return hydrateAuthors(jams, new Map(), themes)
  }
}
