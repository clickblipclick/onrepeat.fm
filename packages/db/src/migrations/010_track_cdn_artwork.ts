import { Kysely } from 'kysely'

export async function up(db: Kysely<any>): Promise<void> {
  // Self-hosted (R2/CDN) copy of the cover art. The resolver fills this after persisting the
  // provider image; `artwork_url` stays the canonical provider URL (source of truth + fallback).
  // Null ⇒ not yet persisted ⇒ reads fall back to artwork_url.
  await db.schema
    .alterTable('tracks')
    .addColumn('cdn_artwork_url', 'text')
    .execute()
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.alterTable('tracks').dropColumn('cdn_artwork_url').execute()
}
