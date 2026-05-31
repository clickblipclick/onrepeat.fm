import { createBskyClient, hydrateAuthors, type JamView, type HydratedJamView } from '@onrepeat/appview'

const globalForBsky = globalThis as unknown as { __onrepeatBsky?: ReturnType<typeof createBskyClient> }
export const bsky = globalForBsky.__onrepeatBsky ?? createBskyClient()
if (process.env.NODE_ENV !== 'production') globalForBsky.__onrepeatBsky = bsky

/**
 * Hydrate a list of views' authors via the shared (cached) bsky client.
 * Hydration is enrichment, never required: if the bsky profile lookup fails
 * (network / rate-limit / outage), degrade to DID-only authors rather than
 * failing the page (per design spec §8).
 */
export async function hydrate(jams: JamView[]): Promise<HydratedJamView[]> {
  try {
    const profiles = await bsky.getProfiles([...new Set(jams.map((j) => j.authorDid))])
    return hydrateAuthors(jams, profiles)
  } catch (err) {
    console.error('[web] profile hydration failed; serving DID-only authors', err)
    return hydrateAuthors(jams, new Map())
  }
}
