import { Kysely, sql } from 'kysely'

export async function up(db: Kysely<any>): Promise<void> {
  // Native social graph. One row per fm.onrepeat.graph.follow record. "Following X"
  // is WHERE author_did = X; "followers of X" is WHERE subject_did = X.
  await db.schema
    .createTable('follows')
    .addColumn('uri', 'text', (c) => c.primaryKey())
    .addColumn('author_did', 'text', (c) => c.notNull())
    .addColumn('subject_did', 'text', (c) => c.notNull())
    .addColumn('created_at', 'timestamptz', (c) => c.notNull())
    .addColumn('indexed_at', 'timestamptz', (c) =>
      c.notNull().defaultTo(sql`now()`),
    )
    .execute()

  // The two query directions: who someone follows, and who follows someone.
  await sql`create index follows_author_idx on follows (author_did)`.execute(db)
  await sql`create index follows_subject_idx on follows (subject_did)`.execute(
    db,
  )
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable('follows').ifExists().execute()
}
