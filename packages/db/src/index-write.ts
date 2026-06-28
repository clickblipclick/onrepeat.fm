import type { Insertable } from 'kysely'

import type { FollowRecord, JamRecord, LikeRecord } from '@onrepeat/lexicons'

import type { DB } from './client'
import type { ActorStatus, FollowsTable, JamsTable, LikesTable } from './schema'

/** The repo DID is the authority of an at-uri: at://<did>/<collection>/<rkey>. */
function didFromAtUri(uri: string): string | null {
  const match = uri.match(/^at:\/\/([^/]+)\//)
  return match ? (match[1] ?? null) : null
}

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
    via_did: record.via?.uri ? didFromAtUri(record.via.uri) : null,
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

/**
 * Upsert a like row into the index. Idempotent by at-uri: re-indexing the same
 * uri refreshes all columns. Shared by the firehose ingester and the web app's
 * write-through (read-your-writes) path.
 */
export async function indexLike(
  db: DB,
  args: { uri: string; did: string; record: LikeRecord },
): Promise<void> {
  const row = likeRow(args.uri, args.did, args.record)
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

/** Remove a like row from the index by at-uri. Idempotent (no-op if absent). */
export async function removeLike(db: DB, uri: string): Promise<void> {
  await db.deleteFrom('likes').where('uri', '=', uri).execute()
}

/** Build a follows insert row. */
export function followRow(
  uri: string,
  did: string,
  record: FollowRecord,
): Insertable<FollowsTable> {
  return {
    uri,
    author_did: did,
    subject_did: record.subject,
    created_at: record.createdAt,
  }
}

/**
 * Upsert a follow row into the index. Idempotent by at-uri. Shared by the firehose
 * ingester and the web app's write-through (read-your-writes) path. Self-follows
 * (subject === author) are skipped — representable in the lexicon but never indexed,
 * so they can't pollute the graph or the feed.
 */
export async function indexFollow(
  db: DB,
  args: { uri: string; did: string; record: FollowRecord },
): Promise<void> {
  if (args.record.subject === args.did) return // skip self-follow
  const row = followRow(args.uri, args.did, args.record)
  await db
    .insertInto('follows')
    .values(row)
    .onConflict((oc) =>
      oc.column('uri').doUpdateSet({
        author_did: row.author_did,
        subject_did: row.subject_did,
        created_at: row.created_at,
      }),
    )
    .execute()
}

/** Remove a follow row from the index by at-uri. Idempotent (no-op if absent). */
export async function removeFollow(db: DB, uri: string): Promise<void> {
  await db.deleteFrom('follows').where('uri', '=', uri).execute()
}

/**
 * Set (or clear, with null) an actor's denormalized color theme. Upserts by DID so it
 * works whether or not the actor row already exists, and touches ONLY color_theme —
 * last_seen and the bsky-mirrored profile fields are left untouched.
 */
export async function setActorTheme(
  db: DB,
  did: string,
  theme: string | null,
): Promise<void> {
  await db
    .insertInto('actors')
    .values({ did, color_theme: theme })
    .onConflict((oc) => oc.column('did').doUpdateSet({ color_theme: theme }))
    .execute()
}

/**
 * Mirror an account's upstream state (firehose #account event). Deliberately an
 * UPDATE, not an upsert: the account stream covers every repo on the network and
 * we only track authors we've indexed — unknown DIDs must not create rows.
 */
export async function setActorStatus(
  db: DB,
  did: string,
  status: ActorStatus,
): Promise<void> {
  await db
    .updateTable('actors')
    .set({ status })
    .where('did', '=', did)
    .execute()
}

/**
 * Remove all indexed content authored by a DID — their jams, their likes, and
 * others' likes on their jams (the subject is gone). For accounts deleted
 * upstream: deactivation/suspension is reversible and only gated at read time,
 * but a deleted repo is gone for good and we must not keep serving its data.
 */
export async function purgeActorContent(db: DB, did: string): Promise<void> {
  // at-uri authority prefix; escape LIKE wildcards (did:web may contain '%').
  const prefix = `at://${did.replace(/[\\%_]/g, (m) => `\\${m}`)}/%`
  // One transaction: a failure between the three statements would otherwise leave a
  // half-purged "deleted" repo (e.g. jams gone but others' likes on them orphaned).
  await db.transaction().execute(async (trx) => {
    await trx
      .deleteFrom('likes')
      .where((eb) =>
        eb.or([eb('author_did', '=', did), eb('subject_uri', 'like', prefix)]),
      )
      .execute()
    await trx.deleteFrom('jams').where('author_did', '=', did).execute()
    // A deleted repo's follow edges go too — both who they followed and who
    // followed them (their identity as a subject is gone).
    await trx
      .deleteFrom('follows')
      .where((eb) =>
        eb.or([eb('author_did', '=', did), eb('subject_did', '=', did)]),
      )
      .execute()
    // Their profile record died with the repo; fall back to the default theme.
    await trx
      .updateTable('actors')
      .set({ color_theme: null })
      .where('did', '=', did)
      .execute()
  })
}

/** Profile fields mirrored from a bsky profile lookup. `null` means bsky has no
 *  profile for the DID (a negative-cache result). Structurally satisfied by
 *  @onrepeat/appview's `ActorProfile`. */
export interface ActorProfileInput {
  handle: string
  displayName?: string
  avatar?: string
}

/**
 * Write-through the denormalized bsky profile cache for a batch of DIDs. Upsert by DID
 * (an author can be hydrated before the ingester has seen any record from them — e.g. a
 * re-jam `via` author or a liker). Touches ONLY the profile columns + `profile_updated_at`,
 * never color_theme/status/last_seen. A null `profile` stores a negative-cache row
 * (null fields + fresh stamp) so reads don't refetch a known-absent profile within the TTL.
 * Empty-safe.
 */
export async function upsertActorProfiles(
  db: DB,
  entries: Array<{ did: string; profile: ActorProfileInput | null }>,
  updatedAt: Date,
): Promise<void> {
  if (entries.length === 0) return
  const rows = entries.map((e) => ({
    did: e.did,
    handle: e.profile?.handle ?? null,
    display_name: e.profile?.displayName ?? null,
    avatar: e.profile?.avatar ?? null,
    profile_updated_at: updatedAt,
  }))
  await db
    .insertInto('actors')
    .values(rows)
    // Multi-row upsert: the conflict set must reference the would-be-inserted row via
    // `excluded.*` (NOT a fixed value like single-row upserts do), so each row updates to
    // its own incoming values.
    .onConflict((oc) =>
      oc.column('did').doUpdateSet((eb) => ({
        handle: eb.ref('excluded.handle'),
        display_name: eb.ref('excluded.display_name'),
        avatar: eb.ref('excluded.avatar'),
        profile_updated_at: eb.ref('excluded.profile_updated_at'),
      })),
    )
    .execute()
}

/**
 * Mark a track's resolution as permanently failed. Used both when a job's source URL
 * can't be resolved at all and when the resolver exhausts its retries — either way the
 * track must leave `pending` so reads stop waiting on it. Idempotent. Guards against
 * clobbering a terminal success: a late failure callback (e.g. a retry that throws
 * after another attempt already resolved the track) must NOT flip `resolved`/
 * `self_contained` back to `failed`, so the write only applies to non-success rows.
 * Warns when nothing was updated — either the track was deleted, or it had already
 * resolved and the failed-mark was correctly skipped.
 */
export async function markTrackFailed(db: DB, id: string): Promise<void> {
  const res = await db
    .updateTable('tracks')
    .set({ resolution_status: 'failed', resolved_at: new Date() })
    .where('id', '=', id)
    .where('resolution_status', 'in', ['pending', 'failed'])
    .execute()
  if ((res[0]?.numUpdatedRows ?? 0n) === 0n)
    console.warn(
      `[db] markTrackFailed: ${id} not marked — track deleted or already resolved`,
    )
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
