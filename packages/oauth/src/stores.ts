import type {
  NodeSavedSession,
  NodeSavedSessionStore,
  NodeSavedState,
  NodeSavedStateStore,
} from '@atproto/oauth-client-node'
import { sql, type SqlBool } from 'kysely'

import type { DB } from '@onrepeat/db'

import type { StoreCipher } from './crypto'

/** Authorization-request state is single-use and short-lived; flows complete in minutes.
 *  The auth server expires the PAR request_uri at ~10 minutes anyway, so anything older
 *  is dead weight — and each stale row holds a freshly-minted DPoP private key. */
const STATE_TTL_MS = 10 * 60 * 1000 // 10 minutes

/** Drop sessions untouched for this long. A live session is re-`set` on every token
 *  refresh, so a row this stale belongs to an account that stopped using the app; its
 *  encrypted refresh token + DPoP key are dead weight that only widens the blast radius
 *  of a DB compromise. */
const SESSION_MAX_IDLE_MS = 90 * 24 * 60 * 60 * 1000 // 90 days

export interface StoreOptions {
  /** Encrypts rows at rest (they hold refresh tokens / DPoP private keys). Plaintext
   *  legacy rows remain readable; see {@link StoreCipher}. Omit only in local dev. */
  cipher?: StoreCipher
}

/** Stores short-lived OAuth authorization-request state, keyed by an opaque token. */
export class KyselyStateStore implements NodeSavedStateStore {
  constructor(
    private db: DB,
    private opts: StoreOptions = {},
  ) {}

  async get(key: string): Promise<NodeSavedState | undefined> {
    // Enforce the TTL on read, not just via the opportunistic sweep in set():
    // on a quiet instance a stale row would otherwise stay servable indefinitely.
    const cutoff = new Date(Date.now() - STATE_TTL_MS)
    const row = await this.db
      .selectFrom('oauth_state')
      .select('state')
      .where('key', '=', key)
      .where(sql<SqlBool>`created_at >= ${cutoff}`)
      .executeTakeFirst()
    if (!row) return undefined
    const opened = this.opts.cipher
      ? this.opts.cipher.open(row.state)
      : row.state
    return JSON.parse(opened) as NodeSavedState
  }

  async set(key: string, val: NodeSavedState): Promise<void> {
    const json = JSON.stringify(val)
    const state = this.opts.cipher ? this.opts.cipher.seal(json) : json
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
  constructor(
    private db: DB,
    private opts: StoreOptions = {},
  ) {}

  async get(did: string): Promise<NodeSavedSession | undefined> {
    const row = await this.db
      .selectFrom('oauth_session')
      .select('session')
      .where('did', '=', did)
      .executeTakeFirst()
    if (!row) return undefined
    const opened = this.opts.cipher
      ? this.opts.cipher.open(row.session)
      : row.session
    return JSON.parse(opened) as NodeSavedSession
  }

  async set(did: string, val: NodeSavedSession): Promise<void> {
    const json = JSON.stringify(val)
    const session = this.opts.cipher ? this.opts.cipher.seal(json) : json
    await this.db
      .insertInto('oauth_session')
      .values({ did, session })
      .onConflict((oc) =>
        oc.column('did').doUpdateSet({ session, updated_at: new Date() }),
      )
      .execute()
    // Opportunistically drop long-idle sessions so abandoned accounts' credentials don't
    // accumulate forever. Best-effort: never fail a refresh because cleanup hiccuped.
    void this.deleteIdleSessions().catch(() => {})
  }

  async del(did: string): Promise<void> {
    await this.db.deleteFrom('oauth_session').where('did', '=', did).execute()
  }

  /** Delete sessions untouched for longer than the max-idle window. Returns the count
   *  removed. Safe to also run from a periodic job. */
  async deleteIdleSessions(now: Date = new Date()): Promise<number> {
    const cutoff = new Date(now.getTime() - SESSION_MAX_IDLE_MS)
    const res = await this.db
      .deleteFrom('oauth_session')
      .where(sql<SqlBool>`updated_at < ${cutoff}`)
      .executeTakeFirst()
    return Number(res.numDeletedRows ?? 0n)
  }
}
