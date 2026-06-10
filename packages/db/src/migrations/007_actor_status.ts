import { Kysely, sql } from 'kysely'

export async function up(db: Kysely<any>): Promise<void> {
  // Mirrors the account's upstream state from firehose #account events. Anything
  // other than 'active' hides the actor's content at read time; 'deleted'
  // additionally purges their indexed rows (the repo is gone for good, while
  // deactivation is reversible).
  await db.schema
    .alterTable('actors')
    .addColumn('status', 'text', (c) =>
      c
        .notNull()
        .defaultTo('active')
        .check(
          sql`status in ('active', 'deactivated', 'suspended', 'takendown', 'deleted')`,
        ),
    )
    .execute()
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.alterTable('actors').dropColumn('status').execute()
}
