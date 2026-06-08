import { sql, type SqlBool } from 'kysely'
import type {
  NodeSavedState,
  NodeSavedStateStore,
  NodeSavedSession,
  NodeSavedSessionStore,
} from '@atproto/oauth-client-node'
import type { DB } from '@onrepeat/db'

/** Authorization-request state is single-use and short-lived; flows complete in minutes.
 *  Anything older than this was abandoned and is safe to prune. */
const STATE_TTL_MS = 60 * 60 * 1000 // 1 hour

/** Stores short-lived OAuth authorization-request state, keyed by an opaque token. */
export class KyselyStateStore implements NodeSavedStateStore {
  constructor(private db: DB) {}

  async get(key: string): Promise<NodeSavedState | undefined> {
    const row = await this.db
      .selectFrom('oauth_state')
      .select('state')
      .where('key', '=', key)
      .executeTakeFirst()
    return row ? (JSON.parse(row.state) as NodeSavedState) : undefined
  }

  async set(key: string, val: NodeSavedState): Promise<void> {
    const state = JSON.stringify(val)
    await this.db
      .insertInto('oauth_state')
      .values({ key, state })
      .onConflict((oc) => oc.column('key').doUpdateSet({ state }))
      .execute()
    // Opportunistically prune abandoned flows so the table can't grow unbounded — each
    // stale row holds a freshly-minted DPoP private key. Best-effort: never fail a login
    // because cleanup hiccuped. Login starts are low-volume, so a sweep per set is cheap.
    void this.deleteExpiredState().catch(() => {})
  }

  async del(key: string): Promise<void> {
    await this.db.deleteFrom('oauth_state').where('key', '=', key).execute()
  }

  /** Delete authorization-request state past the TTL. Returns the row count removed. */
  async deleteExpiredState(now: Date = new Date()): Promise<number> {
    const cutoff = new Date(now.getTime() - STATE_TTL_MS)
    const res = await this.db
      .deleteFrom('oauth_state')
      .where(sql<SqlBool>`created_at < ${cutoff}`)
      .executeTakeFirst()
    return Number(res.numDeletedRows ?? 0n)
  }
}

/** Persists authenticated OAuth sessions (DPoP-bound tokens), keyed by the user's DID. */
export class KyselySessionStore implements NodeSavedSessionStore {
  constructor(private db: DB) {}

  async get(did: string): Promise<NodeSavedSession | undefined> {
    const row = await this.db
      .selectFrom('oauth_session')
      .select('session')
      .where('did', '=', did)
      .executeTakeFirst()
    return row ? (JSON.parse(row.session) as NodeSavedSession) : undefined
  }

  async set(did: string, val: NodeSavedSession): Promise<void> {
    const session = JSON.stringify(val)
    await this.db
      .insertInto('oauth_session')
      .values({ did, session })
      .onConflict((oc) =>
        oc.column('did').doUpdateSet({ session, updated_at: new Date() }),
      )
      .execute()
  }

  async del(did: string): Promise<void> {
    await this.db.deleteFrom('oauth_session').where('did', '=', did).execute()
  }
}
