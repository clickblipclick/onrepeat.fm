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

// All env validation and client construction is deferred to first use: `next build`
// (page-data collection) imports route modules with NODE_ENV=production, and an
// import-time guard would make local smoke builds impossible without prod OAuth env.
// The guards below still fail closed at runtime — on the first OAuth touch — for a
// misconfigured deploy.

interface OauthRuntime {
  clientPromise: Promise<NodeOAuthClient>
  sessionStore: KyselySessionStore
}

// Singleton across hot reloads in dev. Holds the build promise (not the client) so
// concurrent first uses during a cold start share one in-flight build.
const globalForOauth = globalThis as unknown as {
  // Renamed from __onrepeatOAuth (which cached a bare client promise) so a
  // hot-reloaded dev server can't pick up a stale cache with the old shape.
  __onrepeatOAuthRuntime?: OauthRuntime
}

function init(): OauthRuntime {
  const databaseUrl = process.env.DATABASE_URL
  if (!databaseUrl) throw new Error('DATABASE_URL must be set')

  const _rawOauthMode = process.env.OAUTH_MODE ?? 'dev'
  if (_rawOauthMode !== 'dev' && _rawOauthMode !== 'prod') {
    throw new Error(
      `OAUTH_MODE must be 'dev' or 'prod' (got '${_rawOauthMode}')`,
    )
  }
  const oauthMode: 'dev' | 'prod' = _rawOauthMode

  const publicUrl = process.env.PUBLIC_URL ?? 'http://127.0.0.1:3000'
  const isLoopbackUrl =
    /^https?:\/\/(127\.0\.0\.1|\[::1\]|localhost)(:|\/|$)/i.test(publicUrl)

  // Fail closed in production: a deploy that forgets OAUTH_MODE/PUBLIC_URL must refuse
  // to serve OAuth rather than silently running dev/loopback OAuth (public client_id,
  // no keyset, 'none' auth) on a public origin.
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
  // fail closed before any OAuth state is written. (Keyed on OAUTH_MODE, not NODE_ENV,
  // so a staging deploy running prod OAuth gets the same guarantees.)
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

  const sessionStore = new KyselySessionStore(db, { cipher: storeCipher })

  const clientPromise = (async () =>
    createOAuthClient({
      mode: oauthMode,
      publicUrl,
      stateStore: new KyselyStateStore(db, { cipher: storeCipher }),
      sessionStore,
      keyset:
        oauthMode === 'prod'
          ? await loadKeysetFromJson(process.env.OAUTH_PRIVATE_KEYS!)
          : undefined,
      // Cross-instance lock so concurrent token refreshes for the same session
      // can't rotate each other's refresh token and get the session revoked.
      requestLock: createPgAdvisoryLock(db),
    }))()

  return { clientPromise, sessionStore }
}

export function getOauthClient(): Promise<NodeOAuthClient> {
  return (globalForOauth.__onrepeatOAuthRuntime ??= init()).clientPromise
}

/**
 * Shared session store. Also used by getSessionAgent to tell whether a failed
 * restore() left the stored session intact (transient) or deleted it (expired).
 */
export function getOauthSessionStore(): KyselySessionStore {
  return (globalForOauth.__onrepeatOAuthRuntime ??= init()).sessionStore
}
