import type { NodeOAuthClient } from '@atproto/oauth-client-node'
import {
  createOAuthClient,
  createStoreCipher,
  loadKeysetFromJson,
  KyselyStateStore,
  KyselySessionStore,
  createPgAdvisoryLock,
  type StoreCipher,
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

// Prod mode additionally requires the signing keyset and the at-rest store key —
// fail closed at boot, not at first login. (Keyed on OAUTH_MODE, not NODE_ENV, so a
// staging deploy running prod OAuth gets the same guarantees.)
if (oauthMode === 'prod') {
  if (!process.env.OAUTH_PRIVATE_KEYS) {
    throw new Error(
      'OAUTH_PRIVATE_KEYS must be set in prod OAuth mode (JSON array of ES256 PKCS8 PEMs/JWKs)',
    )
  }
  if (!process.env.OAUTH_STORE_KEY) {
    throw new Error(
      'OAUTH_STORE_KEY must be set in prod OAuth mode (32 bytes base64 — openssl rand -base64 32) to encrypt stored OAuth sessions',
    )
  }
}

// Encrypts oauth_state/oauth_session rows (refresh tokens + DPoP private keys) at
// rest. Optional in dev so a fresh checkout works without extra setup; rows written
// before a key existed stay readable (plaintext passthrough on read).
const storeCipher: StoreCipher | undefined = process.env.OAUTH_STORE_KEY
  ? createStoreCipher(process.env.OAUTH_STORE_KEY)
  : undefined

const db = createDb(databaseUrl)

// Shared session store. Also used by getSessionAgent to tell whether a failed
// restore() left the stored session intact (transient) or deleted it (expired).
export const oauthSessionStore = new KyselySessionStore(db, {
  cipher: storeCipher,
})

// Singleton across hot reloads in dev. Holds the build promise (not the client) so
// concurrent first imports during a cold start share one in-flight build.
const globalForOauth = globalThis as unknown as {
  __onrepeatOAuth?: Promise<NodeOAuthClient>
}

async function build(): Promise<NodeOAuthClient> {
  return createOAuthClient({
    mode: oauthMode,
    publicUrl,
    stateStore: new KyselyStateStore(db, { cipher: storeCipher }),
    sessionStore: oauthSessionStore,
    keyset:
      oauthMode === 'prod'
        ? await loadKeysetFromJson(process.env.OAUTH_PRIVATE_KEYS!)
        : undefined,
    // Cross-instance lock so concurrent token refreshes for the same session
    // can't rotate each other's refresh token and get the session revoked.
    requestLock: createPgAdvisoryLock(db),
  })
}

export const oauthClient = await (globalForOauth.__onrepeatOAuth ??= build())
