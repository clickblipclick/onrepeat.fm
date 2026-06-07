import type { ActorProfile } from './bsky'
import type { JamView } from './read'

export interface Author {
  did: string
  handle?: string
  displayName?: string
  avatar?: string
}

export type HydratedJamView = JamView & {
  author: Author
  /** The original author a re-jam was sourced from (`via`); null for original jams. */
  viaAuthor: Author | null
}

function authorFor(
  did: string,
  profiles: Map<string, ActorProfile | null>,
): Author {
  const p = profiles.get(did)
  return p
    ? {
        did: p.did,
        handle: p.handle,
        displayName: p.displayName,
        avatar: p.avatar,
      }
    : { did }
}

/** Attach an `author` (and `viaAuthor` for re-jams) to each view from a did->profile
 *  map; missing/unknown DIDs get a DID-only author. */
export function hydrateAuthors(
  jams: JamView[],
  profiles: Map<string, ActorProfile | null>,
): HydratedJamView[] {
  return jams.map((j) => ({
    ...j,
    author: authorFor(j.authorDid, profiles),
    viaAuthor: j.via ? authorFor(j.via.did, profiles) : null,
  }))
}
