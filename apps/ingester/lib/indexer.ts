import type { DB } from '@onrepeat/db'
import {
  indexJam,
  indexLike,
  purgeActorContent,
  removeLike,
  removeJam,
  setActorStatus,
  setActorTheme,
} from '@onrepeat/db'
import {
  validateRecord,
  JAM_NSID,
  PROFILE_NSID,
  type JamRecord,
  type LikeRecord,
  type ProfileRecord,
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
  if (evt.action === 'account') {
    // Mirror upstream account state so reads stop serving content of
    // deactivated/suspended/taken-down accounts. UPDATE-only: the account
    // stream covers the whole network and unknown DIDs must not create rows.
    await setActorStatus(db, evt.did, evt.status)
    // Deletion is permanent (the repo is gone); drop their indexed content
    // instead of merely hiding it. Idempotent, so replay is safe.
    if (evt.status === 'deleted') await purgeActorContent(db, evt.did)
    return
  }

  // Record that we've seen this author. Profile fields (handle/avatar) are
  // hydrated later (Plan 5), never here — the ingester makes no outbound calls.
  const now = new Date()
  await db
    .insertInto('actors')
    .values({ did: evt.did, last_seen: now })
    .onConflict((oc) => oc.column('did').doUpdateSet({ last_seen: now }))
    .execute()

  if (evt.action === 'delete') {
    if (evt.collection === JAM_NSID) {
      await removeJam(db, evt.uri)
    } else if (evt.collection === PROFILE_NSID) {
      // Profile gone → fall back to the deterministic default on read.
      await setActorTheme(db, evt.did, null)
    } else {
      await removeLike(db, evt.uri)
    }
    return
  }

  // create | update — validate against the lexicon, skip if malformed.
  const result = validateRecord(evt.collection, evt.record)
  if (!result.success) {
    console.warn(
      `[ingester] skipping invalid ${evt.collection} ${evt.uri}: ${result.error}`,
    )
    return
  }

  if (evt.collection === JAM_NSID) {
    if (evt.cid == null) {
      // create/update always carry a cid (the normalizer guarantees it). A null here
      // means a malformed event bypassed toIngestEvent — skip loudly, don't crash.
      console.warn(`[ingester] skipping jam ${evt.uri} with missing cid`)
      return
    }
    await indexJam(db, {
      uri: evt.uri,
      cid: evt.cid,
      did: evt.did,
      record: evt.record as JamRecord,
    })
    await hooks.onJamIndexed(evt)
  } else if (evt.collection === PROFILE_NSID) {
    const record = evt.record as ProfileRecord
    await setActorTheme(db, evt.did, record.colorTheme ?? null)
  } else {
    await indexLike(db, {
      uri: evt.uri,
      did: evt.did,
      record: evt.record as LikeRecord,
    })
  }
}
