import { Kysely, sql } from 'kysely'

export async function up(db: Kysely<any>): Promise<void> {
  // `likes.author_did` backs the per-author "active" subquery and the viewer's
  // liked-by-you lookup on every feed render (appview read.ts); without it those
  // degrade to a sequential scan as the likes table grows.
  await sql`create index likes_author_idx on likes (author_did)`.execute(db)

  // `jams.via_uri` backs the re-jam fan-out on every jam-detail page; index it
  // together with created_at so the newest-first ordering is served from the index.
  await sql`create index jams_via_uri_created_idx on jams (via_uri, created_at desc)`.execute(
    db,
  )

  // `tracks.resolution_status` is scanned by the resolver backfill (both the
  // pending re-queue and the terminal-status re-resolve passes); a plain index
  // covers every status filter, not just one value.
  await sql`create index tracks_resolution_status_idx on tracks (resolution_status)`.execute(
    db,
  )

  // `oauth_session.updated_at` backs the idle-session sweep (KyselySessionStore);
  // without it the periodic/opportunistic cleanup is a sequential scan.
  await sql`create index oauth_session_updated_at_idx on oauth_session (updated_at)`.execute(
    db,
  )
}

export async function down(db: Kysely<any>): Promise<void> {
  await sql`drop index if exists oauth_session_updated_at_idx`.execute(db)
  await sql`drop index if exists tracks_resolution_status_idx`.execute(db)
  await sql`drop index if exists jams_via_uri_created_idx`.execute(db)
  await sql`drop index if exists likes_author_idx`.execute(db)
}
