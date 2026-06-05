import { Kysely, sql } from 'kysely'

export async function up(db: Kysely<any>): Promise<void> {
  // Single-row-per-service key/value table holding the firehose cursor (seq).
  // Written throttled by the ingester; idempotent record upserts make loose
  // cursor durability safe (a restart may replay a few events harmlessly).
  await db.schema
    .createTable('subscription_state')
    .addColumn('service', 'text', (c) => c.primaryKey())
    .addColumn('cursor', 'bigint', (c) => c.notNull())
    .addColumn('updated_at', 'timestamptz', (c) =>
      c.notNull().defaultTo(sql`now()`),
    )
    .execute()
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable('subscription_state').ifExists().execute()
}
