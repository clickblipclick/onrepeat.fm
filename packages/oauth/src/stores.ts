import type {
  NodeSavedState,
  NodeSavedStateStore,
  NodeSavedSession,
  NodeSavedSessionStore,
} from '@atproto/oauth-client-node'
import type { DB } from '@onrepeat/db'

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
  }

  async del(key: string): Promise<void> {
    await this.db.deleteFrom('oauth_state').where('key', '=', key).execute()
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
      .onConflict((oc) => oc.column('did').doUpdateSet({ session, updated_at: new Date() }))
      .execute()
  }

  async del(did: string): Promise<void> {
    await this.db.deleteFrom('oauth_session').where('did', '=', did).execute()
  }
}
