import { Kysely, sql } from 'kysely'

export async function up(db: Kysely<any>): Promise<void> {
  // No foreign keys by design: this is an atproto AppView fed by an out-of-order
  // firehose. A jam may be ingested before its author's profile or before its
  // track is resolved (track_id is nullable until resolution), so referential
  // integrity is enforced at the application layer, not via FK constraints.

  await db.schema
    .createTable('actors')
    .addColumn('did', 'text', (c) => c.primaryKey())
    .addColumn('handle', 'text')
    .addColumn('display_name', 'text')
    .addColumn('avatar', 'text')
    .addColumn('last_seen', 'timestamptz')
    .execute()

  await db.schema
    .createTable('tracks')
    .addColumn('id', 'text', (c) => c.primaryKey())
    .addColumn('isrc', 'text')
    .addColumn('title', 'text')
    .addColumn('artist', 'text')
    .addColumn('artwork_url', 'text')
    .addColumn('provider_refs', 'jsonb', (c) =>
      c.notNull().defaultTo(sql`'{}'::jsonb`),
    )
    .addColumn('resolution_status', 'text', (c) =>
      c
        .notNull()
        .defaultTo('pending')
        .check(
          sql`resolution_status in ('pending', 'resolved', 'self_contained', 'failed')`,
        ),
    )
    .addColumn('resolved_at', 'timestamptz')
    .execute()

  await db.schema
    .createTable('jams')
    .addColumn('uri', 'text', (c) => c.primaryKey())
    .addColumn('cid', 'text', (c) => c.notNull())
    .addColumn('author_did', 'text', (c) => c.notNull())
    .addColumn('track_id', 'text')
    .addColumn('source_url', 'text', (c) => c.notNull())
    .addColumn('source_provider', 'text')
    .addColumn('raw_title', 'text')
    .addColumn('raw_artist', 'text')
    .addColumn('caption', 'text')
    .addColumn('via_uri', 'text')
    .addColumn('via_did', 'text')
    .addColumn('created_at', 'timestamptz', (c) => c.notNull())
    .addColumn('indexed_at', 'timestamptz', (c) =>
      c.notNull().defaultTo(sql`now()`),
    )
    .execute()

  await db.schema
    .createTable('likes')
    .addColumn('uri', 'text', (c) => c.primaryKey())
    .addColumn('author_did', 'text', (c) => c.notNull())
    .addColumn('subject_uri', 'text', (c) => c.notNull())
    .addColumn('created_at', 'timestamptz', (c) => c.notNull())
    .addColumn('indexed_at', 'timestamptz', (c) =>
      c.notNull().defaultTo(sql`now()`),
    )
    .execute()

  // Drives "current jam per author" lookups (latest within 7 days).
  await sql`create index jams_author_created_idx on jams (author_did, created_at desc)`.execute(
    db,
  )
  // Drives the Explore / Latest feed.
  await sql`create index jams_created_idx on jams (created_at desc)`.execute(db)
  // Drives like counts and liked-by lookups.
  await sql`create index likes_subject_idx on likes (subject_uri)`.execute(db)
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable('likes').ifExists().execute()
  await db.schema.dropTable('jams').ifExists().execute()
  await db.schema.dropTable('tracks').ifExists().execute()
  await db.schema.dropTable('actors').ifExists().execute()
}
