import { Kysely, sql } from 'kysely'

export async function up(db: Kysely<any>): Promise<void> {
  // Same enum discipline as tracks.resolution_status (001) and actors.status (007):
  // `type` drives per-kind rendering, so a typo'd literal from a future write path
  // must fail at insert time instead of surfacing as a notification that never renders.
  await sql`alter table notifications add constraint notifications_type_check check (type in ('like', 'rejam', 'follow'))`.execute(
    db,
  )
}

export async function down(db: Kysely<any>): Promise<void> {
  await sql`alter table notifications drop constraint if exists notifications_type_check`.execute(
    db,
  )
}
