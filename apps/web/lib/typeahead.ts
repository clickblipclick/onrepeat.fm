/** Trimmed actor shape sent from /api/typeahead to the login autocomplete. */
export interface TypeaheadActor {
  handle: string
  displayName?: string
  avatar?: string
}

/** The fields we read off a bsky searchActorsTypeahead result (it carries more). */
interface RawActor {
  did: string
  handle: string
  displayName?: string
  avatar?: string
}

/** Map bsky typeahead actors to the minimal shape the client needs.
 *  Drops the DID and any extra profile fields; skips entries missing a handle. */
export function mapTypeahead(actors: RawActor[]): TypeaheadActor[] {
  return actors
    .filter((a) => Boolean(a.handle))
    .map((a) => {
      const out: TypeaheadActor = { handle: a.handle }
      if (a.displayName) out.displayName = a.displayName
      if (a.avatar) out.avatar = a.avatar
      return out
    })
}
