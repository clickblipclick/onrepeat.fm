import { Kysely, sql } from 'kysely'

export async function up(db: Kysely<any>): Promise<void> {
  // Dead-letter store for firehose events that exhausted ingest retries. @atproto/sync
  // advances the cursor past a failed event regardless, so we capture it here for replay
  // rather than lose it silently. `record` is the decoded value (null for deletes).
  await db.schema
    .createTable('failed_events')
    .addColumn('id', 'bigserial', (c) => c.primaryKey())
    .addColumn('seq', 'bigint', (c) => c.notNull())
    .addColumn('did', 'text', (c) => c.notNull())
    .addColumn('collection', 'text', (c) => c.notNull())
    .addColumn('action', 'text', (c) => c.notNull())
    .addColumn('uri', 'text', (c) => c.notNull())
    .addColumn('cid', 'text')
    .addColumn('record', 'jsonb')
    .addColumn('error', 'text', (c) => c.notNull())
    .addColumn('failed_at', 'timestamptz', (c) =>
      c.notNull().defaultTo(sql`now()`),
    )
    .execute()
  // Inspect/replay newest failures first.
  await sql`create index failed_events_failed_at_idx on failed_events (failed_at desc)`.execute(
    db,
  )
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable('failed_events').ifExists().execute()
}
