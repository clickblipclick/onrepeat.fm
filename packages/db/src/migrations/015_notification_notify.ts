import { Kysely, sql } from 'kysely'

export async function up(db: Kysely<any>): Promise<void> {
  // Realtime fan-out: NOTIFY on anything that changes a user's unread count so
  // web instances holding a LISTEN connection can push to connected clients.
  // Triggers (not app-level pg_notify) because writes come from two processes —
  // the firehose ingester and the web write-through — and both must broadcast
  // without code changes. Payload is just the affected did (column name passed
  // per-trigger via TG_ARGV); listeners re-query rather than trusting the
  // payload. NOTIFY is transactional — delivered only on commit, so listeners
  // never see a row that rolled back.
  await sql`
    create function notifications_notify() returns trigger as $$
    begin
      perform pg_notify('notifications', to_jsonb(new)->>tg_argv[0]);
      return null;
    end;
    $$ language plpgsql
  `.execute(db)
  // AFTER INSERT only fires on a real insert, so the ON CONFLICT DO NOTHING
  // firehose-redelivery path stays silent.
  await sql`
    create trigger notifications_notify_insert
    after insert on notifications
    for each row execute function notifications_notify('recipient_did')
  `.execute(db)
  // Marking notifications seen also changes the unread count (to zero) — an
  // upsert hits INSERT on the user's first visit, UPDATE after, so cover both.
  await sql`
    create trigger notification_state_notify_upsert
    after insert or update on notification_state
    for each row execute function notifications_notify('did')
  `.execute(db)
}

export async function down(db: Kysely<any>): Promise<void> {
  await sql`drop trigger if exists notification_state_notify_upsert on notification_state`.execute(
    db,
  )
  await sql`drop trigger if exists notifications_notify_insert on notifications`.execute(
    db,
  )
  await sql`drop function if exists notifications_notify()`.execute(db)
}
