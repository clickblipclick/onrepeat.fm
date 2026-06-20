import { resolveTheme, type ThemeName } from '@onrepeat/core'

import type { ActorProfile } from './bsky'
import type { JamView } from './read'

export interface Author {
  did: string
  handle?: string
  displayName?: string
  avatar?: string
  /** Resolved color theme (stored choice, or deterministic default from the DID). */
  theme: ThemeName
}

export type HydratedJamView = JamView & {
  author: Author
  /** The original author a re-jam was sourced from (`via`); null for original jams. */
  viaAuthor: Author | null
}

function authorFor(
  did: string,
  profiles: Map<string, ActorProfile | null>,
  themes: Map<string, string | null>,
): Author {
  const theme = resolveTheme(themes.get(did), did)
  const p = profiles.get(did)
  return p
    ? {
        did: p.did,
        handle: p.handle,
        displayName: p.displayName,
        avatar: p.avatar,
        theme,
      }
    : { did, theme }
}

/** Attach an `author` (and `viaAuthor` for re-jams) to each view from a did->profile
 *  map; missing/unknown DIDs get a DID-only author. Each author's color theme is
 *  resolved from the did->stored-theme map (absent/unknown → deterministic default). */
export function hydrateAuthors(
  jams: JamView[],
  profiles: Map<string, ActorProfile | null>,
  themes: Map<string, string | null> = new Map(),
): HydratedJamView[] {
  return jams.map((j) => ({
    ...j,
    author: authorFor(j.authorDid, profiles, themes),
    viaAuthor: j.via ? authorFor(j.via.did, profiles, themes) : null,
  }))
}
