import type { DB } from '@onrepeat/db'
import { indexJam, likeRow } from '@onrepeat/db'
import {
  validateRecord,
  JAM_NSID,
  type JamRecord,
  type LikeRecord,
} from '@onrepeat/lexicons'
import type { IngestEvent } from './events'
import { defaultHooks, type IngesterHooks } from './hooks'

/**
 * Apply one normalized firehose event to the index. Idempotent: creates and
 * updates upsert by at-uri; deletes remove by at-uri. Always records the author.
 */
export async function handleIngestEvent(
  db: DB,
  evt: IngestEvent,
  hooks: IngesterHooks = defaultHooks,
): Promise<void> {
  // Record that we've seen this author. Profile fields (handle/avatar) are
  // hydrated later (Plan 5), never here — the ingester makes no outbound calls.
  const now = new Date()
  await db
    .insertInto('actors')
    .values({ did: evt.did, last_seen: now })
    .onConflict((oc) => oc.column('did').doUpdateSet({ last_seen: now }))
    .execute()

  if (evt.action === 'delete') {
    await db.deleteFrom(evt.collection === JAM_NSID ? 'jams' : 'likes')
      .where('uri', '=', evt.uri)
      .execute()
    return
  }

  // create | update — validate against the lexicon, skip if malformed.
  const result = validateRecord(evt.collection, evt.record)
  if (!result.success) {
    console.warn(`[ingester] skipping invalid ${evt.collection} ${evt.uri}: ${result.error}`)
    return
  }

  if (evt.collection === JAM_NSID) {
    if (evt.cid == null) {
      // create/update always carry a cid (the normalizer guarantees it). A null here
      // means a malformed event bypassed toIngestEvent — skip loudly, don't crash.
      console.warn(`[ingester] skipping jam ${evt.uri} with missing cid`)
      return
    }
    await indexJam(db, { uri: evt.uri, cid: evt.cid, did: evt.did, record: evt.record as JamRecord })
    await hooks.onJamIndexed(evt)
  } else {
    const row = likeRow(evt.uri, evt.did, evt.record as LikeRecord)
    await db
      .insertInto('likes')
      .values(row)
      .onConflict((oc) =>
        oc.column('uri').doUpdateSet({
          author_did: row.author_did,
          subject_uri: row.subject_uri,
          created_at: row.created_at,
        }),
      )
      .execute()
  }
}
