import type { Insertable } from 'kysely'
import type { JamsTable, LikesTable } from '@onrepeat/db'
import type { JamRecord, LikeRecord } from '@onrepeat/lexicons'

/** Build a jams insert row. track_id stays null until Plan 4 resolves the track. */
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
    caption: record.caption ?? null,
    via_uri: record.via?.uri ?? null,
    via_did: record.via?.did ?? null,
    created_at: record.createdAt,
  }
}

// LikesTable has no cid column by design, so the like's own commit cid is not indexed.
export function likeRow(uri: string, did: string, record: LikeRecord): Insertable<LikesTable> {
  return {
    uri,
    author_did: did,
    subject_uri: record.subject.uri,
    created_at: record.createdAt,
  }
}
