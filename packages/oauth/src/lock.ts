import { sql } from 'kysely'
import type { DB } from '@onrepeat/db'

/**
 * The atproto OAuth client's `requestLock` contract: run `fn` while holding a
 * lock named `name`, serializing calls that share a name and releasing on
 * completion (or throw). Mirrors `@atproto/oauth-client`'s `RuntimeLock` so the
 * result is assignable to `NodeOAuthClient`'s `requestLock` option without
 * reaching into that transitive dependency for the type.
 */
export type RuntimeLock = <T>(
  name: string,
  fn: () => T | PromiseLike<T>,
) => Promise<T>

/**
 * A cross-instance `requestLock` backed by Postgres session-level advisory locks.
 *
 * Why this exists: atproto refresh tokens are single-use and rotate on every
 * refresh. If two server instances refresh the same session concurrently, the
 * second presents an already-rotated (dead) token and the auth server may revoke
 * the whole session, logging the user out. The library's built-in fallback lock
 * (`requestLocalLock`) is in-process only, so it cannot coordinate a
 * horizontally-scaled deployment. This lock serializes refreshes across every
 * instance that shares the database.
 *
 * Session-level (`pg_advisory_lock`) rather than transaction-level
 * (`pg_advisory_xact_lock`) is deliberate: `fn` performs network I/O (the token
 * refresh) and writes via the session store on a *different* pooled connection,
 * so it must not run inside a transaction. The lock is bound to the single
 * connection held for the duration of `fn`; Postgres also releases it
 * automatically if that connection drops, so a crashed holder cannot deadlock us.
 *
 * Each in-flight locked call holds one pooled connection for the (sub-second)
 * refresh — fine at this app's volume.
 */
export function createPgAdvisoryLock(db: DB): RuntimeLock {
  return (name, fn) =>
    db.connection().execute(async (conn) => {
      // hashtext() maps the lock name to the int key shared by both calls.
      await sql`select pg_advisory_lock(hashtext(${name}))`.execute(conn)
      try {
        return await fn()
      } finally {
        await sql`select pg_advisory_unlock(hashtext(${name}))`.execute(conn)
      }
    })
}
