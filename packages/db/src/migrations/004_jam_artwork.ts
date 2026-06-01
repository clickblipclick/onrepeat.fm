import { Kysely } from 'kysely'

export async function up(db: Kysely<any>): Promise<void> {
  // Denormalized artwork captured at post time (mirrors raw_title/raw_artist).
  // The resolver's tracks.artwork_url overrides it once resolved.
  await db.schema.alterTable('jams').addColumn('raw_artwork_url', 'text').execute()
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.alterTable('jams').dropColumn('raw_artwork_url').execute()
}
