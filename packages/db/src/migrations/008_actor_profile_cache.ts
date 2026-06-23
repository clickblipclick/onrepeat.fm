import { Kysely } from 'kysely'

export async function up(db: Kysely<any>): Promise<void> {
  // Freshness stamp for the denormalized bsky profile cache (handle/display_name/avatar,
  // added in 001_init but previously unused). Null ⇒ never hydrated / stale ⇒ refetch on
  // first read. The profile columns are a CACHE in front of public.api.bsky.app, not a
  // source of truth; reads use a 24h TTL against this column. No backfill.
  await db.schema
    .alterTable('actors')
    .addColumn('profile_updated_at', 'timestamptz')
    .execute()
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema
    .alterTable('actors')
    .dropColumn('profile_updated_at')
    .execute()
}
