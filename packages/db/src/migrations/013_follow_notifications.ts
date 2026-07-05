import { Kysely } from 'kysely'

export async function up(db: Kysely<any>): Promise<void> {
  // Follow notifications have no jam to point at (the record's subject is a DID,
  // not an at-uri), so the subject becomes optional.
  await db.schema
    .alterTable('notifications')
    .alterColumn('subject_uri', (c) => c.dropNotNull())
    .execute()
}

export async function down(db: Kysely<any>): Promise<void> {
  // Rows without a subject (follows) can't survive the constraint coming back.
  await db
    .deleteFrom('notifications')
    .where('subject_uri', 'is', null)
    .execute()
  await db.schema
    .alterTable('notifications')
    .alterColumn('subject_uri', (c) => c.setNotNull())
    .execute()
}
