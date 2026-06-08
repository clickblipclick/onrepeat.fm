import type { Insertable } from 'kysely'
import type { JamRecord, LikeRecord } from '@onrepeat/lexicons'
import type { JamsTable, LikesTable } from './schema'
import type { DB } from './client'

/**
 * Build a `jams` insert row from a JamRecord. `track_id` starts null (the resolver links
 * it later). `raw_artwork_url` is denormalized at post time as a fallback; the resolver's
 * `tracks.artwork_url` overrides it once resolved. `isrc` is resolver-owned and not stored here.
 */
export function jamRow(
  uri: string,
  cid: string,
  did: string,
  record: JamRecord,
): Insertable<JamsTable> {
  return {
    uri,
    cid,
    author_did: did,
    track_id: null,
    source_url: record.sourceUrl,
    source_provider: record.sourceProvider,
    raw_title: record.title,
    raw_artist: record.artist,
    raw_artwork_url: record.artworkUrl ?? null,
    caption: record.caption ?? null,
    via_uri: record.via?.uri ?? null,
    via_did: record.via?.did ?? null,
    created_at: record.createdAt,
  }
}

/** Build a likes insert row. */
export function likeRow(
  uri: string,
  did: string,
  record: LikeRecord,
): Insertable<LikesTable> {
  return {
    uri,
    author_did: did,
    subject_uri: record.subject.uri,
    created_at: record.createdAt,
  }
}

/**
 * Upsert a jam row into the index. Idempotent by at-uri: re-indexing the same
 * uri updates all mutable columns (cid, content fields) but preserves an
 * existing track_id so a resolver-set link survives re-ingest.
 *
 * Does NOT upsert the actor or call any hooks — jam row only.
 */
export async function indexJam(
  db: DB,
  args: { uri: string; cid: string; did: string; record: JamRecord },
): Promise<void> {
  const row = jamRow(args.uri, args.cid, args.did, args.record)
  await db
    .insertInto('jams')
    .values(row)
    .onConflict((oc) =>
      oc.column('uri').doUpdateSet({
        // Mutable jam columns — ADD NEW MUTABLE COLUMNS HERE so re-ingest keeps them fresh.
        cid: row.cid,
        source_url: row.source_url,
        source_provider: row.source_provider,
        raw_title: row.raw_title,
        raw_artist: row.raw_artist,
        raw_artwork_url: row.raw_artwork_url,
        caption: row.caption,
        via_uri: row.via_uri,
        via_did: row.via_did,
        // created_at intentionally omitted: immutable after first write.
        // track_id intentionally omitted: owned by the resolver, must survive re-ingest.
      }),
    )
    .execute()
}

/** Remove a jam row from the index by at-uri. Idempotent (no-op if absent). */
export async function removeJam(db: DB, uri: string): Promise<void> {
  await db.deleteFrom('jams').where('uri', '=', uri).execute()
}

/** A firehose event that couldn't be indexed, for the dead-letter store. */
export interface FailedEventInput {
  seq: number
  did: string
  collection: string
  action: string
  uri: string
  cid: string | null
  /** Decoded record value; undefined on delete (stored as null). */
  record: unknown
}

/**
 * Persist a firehose event that exhausted ingest retries, so it can be inspected/replayed
 * instead of being silently lost when @atproto/sync advances the cursor past it.
 */
export async function recordFailedEvent(
  db: DB,
  evt: FailedEventInput,
  error: string,
): Promise<void> {
  await db
    .insertInto('failed_events')
    .values({
      seq: evt.seq,
      did: evt.did,
      collection: evt.collection,
      action: evt.action,
      uri: evt.uri,
      cid: evt.cid,
      record: evt.record === undefined ? null : JSON.stringify(evt.record),
      error,
    })
    .execute()
}
