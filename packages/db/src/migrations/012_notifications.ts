import { Kysely, sql } from 'kysely'

export async function up(db: Kysely<any>): Promise<void> {
  // Derived appview state (Bluesky-style): one row per source record (a like or a
  // re-jam), keyed by that record's at-uri so firehose redelivery after the web
  // write-through is a no-op conflict. Never published back to the network.
  await db.schema
    .createTable('notifications')
    .addColumn('record_uri', 'text', (c) => c.primaryKey())
    .addColumn('recipient_did', 'text', (c) => c.notNull())
    .addColumn('actor_did', 'text', (c) => c.notNull())
    .addColumn('type', 'text', (c) => c.notNull())
    .addColumn('subject_uri', 'text', (c) => c.notNull())
    .addColumn('created_at', 'timestamptz', (c) => c.notNull())
    .addColumn('indexed_at', 'timestamptz', (c) =>
      c.notNull().defaultTo(sql`now()`),
    )
    .execute()

  // Serves both the notifications feed page and the unread count.
  await db.schema
    .createIndex('notifications_recipient_created_idx')
    .on('notifications')
    .columns(['recipient_did', 'created_at desc'])
    .execute()

  // Per-user read watermark: everything at or before seen_at counts as read.
  await db.schema
    .createTable('notification_state')
    .addColumn('did', 'text', (c) => c.primaryKey())
    .addColumn('seen_at', 'timestamptz', (c) => c.notNull())
    .execute()
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable('notification_state').ifExists().execute()
  await db.schema.dropTable('notifications').ifExists().execute()
}
