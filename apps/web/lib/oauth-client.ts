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

const publicUrl = process.env.PUBLIC_URL ?? 'http://127.0.0.1:3000'
const isLoopbackUrl =
  /^https?:\/\/(127\.0\.0\.1|\[::1\]|localhost)(:|\/|$)/i.test(publicUrl)

// Fail closed in production: a deploy that forgets OAUTH_MODE/PUBLIC_URL must refuse to
// boot rather than silently running dev/loopback OAuth (public client_id, no keyset,
// 'none' auth) on a public origin.
if (process.env.NODE_ENV === 'production') {
  if (oauthMode !== 'prod') {
    throw new Error(
      "OAUTH_MODE must be 'prod' in production — refusing to run loopback/dev OAuth on a public deploy",
    )
  }
  if (!process.env.PUBLIC_URL || isLoopbackUrl) {
    throw new Error(
      'PUBLIC_URL must be set to the public https origin in production (got a loopback/unset value)',
    )
  }
}

const db = createDb(databaseUrl)

// Shared session store. Also used by getSessionAgent to tell whether a failed
// restore() left the stored session intact (transient) or deleted it (expired).
export const oauthSessionStore = new KyselySessionStore(db)

// Singleton across hot reloads in dev.
const globalForOauth = globalThis as unknown as {
  __onrepeatOAuth?: ReturnType<typeof build>
}

function build() {
  // PROD KEYSET: prod mode requires an ES256 signing keyset. Before deploying with
  // OAUTH_MODE=prod, load private keys from OAUTH_PRIVATE_KEYS (a JSON array of
  // importable PEM/JWK strings) via `JoseKey.fromImportable(...)` from
  // '@atproto/jwk-jose' and pass them as `keyset: [...]` below. Until that is wired,
  // prod mode fails closed: createOAuthClient throws at startup without a keyset.
  return createOAuthClient({
    mode: oauthMode,
    publicUrl,
    stateStore: new KyselyStateStore(db),
    sessionStore: oauthSessionStore,
    // Cross-instance lock so concurrent token refreshes for the same session
    // can't rotate each other's refresh token and get the session revoked.
    requestLock: createPgAdvisoryLock(db),
  })
}

export const oauthClient = globalForOauth.__onrepeatOAuth ?? build()
if (process.env.NODE_ENV !== 'production')
  globalForOauth.__onrepeatOAuth = oauthClient
