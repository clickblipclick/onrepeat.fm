import { Lexicons } from '@atproto/lexicon'
import jamDoc from '../../../lexicons/fm/onrepeat/jam.json'
import likeDoc from '../../../lexicons/fm/onrepeat/like.json'
import profileDoc from '../../../lexicons/fm/onrepeat/profile.json'

export const lexicons = new Lexicons([
  jamDoc as any,
  likeDoc as any,
  profileDoc as any,
])

export type ValidationOutcome =
  | { success: true }
  | { success: false; error: string }

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
