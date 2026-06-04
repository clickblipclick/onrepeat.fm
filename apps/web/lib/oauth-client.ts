import {
  createOAuthClient,
  KyselyStateStore,
  KyselySessionStore,
  createPgAdvisoryLock,
} from '@onrepeat/oauth'
import { createDb } from '@onrepeat/db'

const databaseUrl = process.env.DATABASE_URL
if (!databaseUrl) throw new Error('DATABASE_URL must be set')

const _rawOauthMode = process.env.OAUTH_MODE ?? 'dev'
if (_rawOauthMode !== 'dev' && _rawOauthMode !== 'prod') {
  throw new Error(`OAUTH_MODE must be 'dev' or 'prod' (got '${_rawOauthMode}')`)
}
const oauthMode: 'dev' | 'prod' = _rawOauthMode

const db = createDb(databaseUrl)

// Shared session store. Also used by getSessionAgent to tell whether a failed
// restore() left the stored session intact (transient) or deleted it (expired).
export const oauthSessionStore = new KyselySessionStore(db)

// Singleton across hot reloads in dev.
const globalForOauth = globalThis as unknown as { __onrepeatOAuth?: ReturnType<typeof build> }

function build() {
  // PROD KEYSET: prod mode requires an ES256 signing keyset. Before deploying with
  // OAUTH_MODE=prod, load private keys from OAUTH_PRIVATE_KEYS (a JSON array of
  // importable PEM/JWK strings) via `JoseKey.fromImportable(...)` from
  // '@atproto/jwk-jose' and pass them as `keyset: [...]` below. Until that is wired,
  // prod mode fails closed: createOAuthClient throws at startup without a keyset.
  return createOAuthClient({
    mode: oauthMode,
    publicUrl: process.env.PUBLIC_URL ?? 'http://127.0.0.1:3000',
    stateStore: new KyselyStateStore(db),
    sessionStore: oauthSessionStore,
    // Cross-instance lock so concurrent token refreshes for the same session
    // can't rotate each other's refresh token and get the session revoked.
    requestLock: createPgAdvisoryLock(db),
  })
}

export const oauthClient = globalForOauth.__onrepeatOAuth ?? build()
if (process.env.NODE_ENV !== 'production') globalForOauth.__onrepeatOAuth = oauthClient
