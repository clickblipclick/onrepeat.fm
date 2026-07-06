import { Lexicons, type LexiconDoc } from '@atproto/lexicon'

// Vendored verbatim from bluesky-social/atproto (lexicons/com/atproto/repo/strongRef.json)
// so the catalog can resolve like.json's external ref — do not hand-edit.
import strongRefDoc from '../../../lexicons/com/atproto/repo/strongRef.json'
import profileDoc from '../../../lexicons/fm/onrepeat/actor/profile.json'
import jamDoc from '../../../lexicons/fm/onrepeat/feed/jam.json'
import likeDoc from '../../../lexicons/fm/onrepeat/feed/like.json'
import followDoc from '../../../lexicons/fm/onrepeat/graph/follow.json'

export const lexicons = new Lexicons([
  jamDoc as LexiconDoc,
  likeDoc as LexiconDoc,
  profileDoc as LexiconDoc,
  followDoc as LexiconDoc,
  strongRefDoc as LexiconDoc,
])

export type ValidationOutcome =
  { success: true; value: unknown } | { success: false; error: string }

/**
 * Validate a record (must include a matching `$type`) against its lexicon.
 * On success, `value` is the canonicalized record returned by the validator —
 * write that, not the input, in case validation normalizes shapes (e.g. blobs).
 */
export function validateRecord(
  nsid: string,
  value: unknown,
): ValidationOutcome {
  try {
    return { success: true, value: lexicons.assertValidRecord(nsid, value) }
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    }
  }
}
