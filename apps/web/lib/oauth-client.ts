import { createOAuthClient, KyselyStateStore, KyselySessionStore } from '@onrepeat/oauth'
import { createDb } from '@onrepeat/db'

const db = createDb(process.env.DATABASE_URL ?? '')

// Singleton across hot reloads in dev.
const globalForOauth = globalThis as unknown as { __onrepeatOAuth?: ReturnType<typeof build> }

function build() {
  return createOAuthClient({
    mode: (process.env.OAUTH_MODE as 'dev' | 'prod') ?? 'dev',
    publicUrl: process.env.PUBLIC_URL ?? 'http://127.0.0.1:3000',
    stateStore: new KyselyStateStore(db),
    sessionStore: new KyselySessionStore(db),
    // prod keyset wiring is added at deploy time; dev needs none.
  })
}

export const oauthClient = globalForOauth.__onrepeatOAuth ?? build()
if (process.env.NODE_ENV !== 'production') globalForOauth.__onrepeatOAuth = oauthClient
