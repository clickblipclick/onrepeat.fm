import { Lexicons } from '@atproto/lexicon'

// Vendored verbatim from bluesky-social/atproto (lexicons/com/atproto/repo/strongRef.json)
// so the catalog can resolve like.json's external ref — do not hand-edit.
import strongRefDoc from '../../../lexicons/com/atproto/repo/strongRef.json'
import profileDoc from '../../../lexicons/fm/onrepeat/actor/profile.json'
import jamDoc from '../../../lexicons/fm/onrepeat/feed/jam.json'
import likeDoc from '../../../lexicons/fm/onrepeat/feed/like.json'
import followDoc from '../../../lexicons/fm/onrepeat/graph/follow.json'

export const lexicons = new Lexicons([
  jamDoc as any,
  likeDoc as any,
  profileDoc as any,
  followDoc as any,
  strongRefDoc as any,
])

export type ValidationOutcome =
  { success: true } | { success: false; error: string }

/** Validate a record (must include a matching `$type`) against its lexicon. */
export function validateRecord(
  nsid: string,
  value: unknown,
): ValidationOutcome {
  try {
    lexicons.assertValidRecord(nsid, value)
    return { success: true }
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    }
  }
}
