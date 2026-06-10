import {
  NodeOAuthClient,
  type NodeSavedStateStore,
  type NodeSavedSessionStore,
} from '@atproto/oauth-client-node'
import { safeFetchWrap } from '@atproto-labs/fetch-node'
import type { JoseKey } from '@atproto/jwk-jose'
import type { RuntimeLock } from './lock'

// Least-privilege granular scope: identity + write access to ONLY our own
// record collections (omitting an action qualifier grants create/update/delete
// on just those collections). No blob/read/preferences access is requested.
export const DEFAULT_SCOPE =
  'atproto repo:fm.onrepeat.jam repo:fm.onrepeat.like repo:fm.onrepeat.profile'

export interface CreateOAuthClientOptions {
  mode: 'dev' | 'prod'
  /** Public origin: dev 'http://127.0.0.1:3000', prod 'https://onrepeat.fm'. No trailing slash. */
  publicUrl: string
  stateStore: NodeSavedStateStore
  sessionStore: NodeSavedSessionStore
  /** Required in prod: the private signing keyset (JoseKey[]). */
  keyset?: JoseKey[]
  scope?: string
  /**
   * Serializes token refreshes for a given session across instances. Without it
   * the library falls back to an in-process lock and warns that credentials
   * might get revoked under horizontal scaling — see {@link createPgAdvisoryLock}.
   */
  requestLock?: RuntimeLock
}

export function createOAuthClient(
  opts: CreateOAuthClientOptions,
): NodeOAuthClient {
  const scope = opts.scope ?? DEFAULT_SCOPE
  const redirectUri = `${opts.publicUrl}/oauth/callback`

  if (opts.mode === 'dev') {
    const clientId =
      `http://localhost/` +
      `?redirect_uri=${encodeURIComponent(redirectUri)}` +
      `&scope=${encodeURIComponent(scope)}`
    return new NodeOAuthClient({
      clientMetadata: {
        client_id: clientId,
        client_name: 'onrepeat.fm (dev)',
        redirect_uris: [redirectUri],
        grant_types: ['authorization_code', 'refresh_token'],
        response_types: ['code'],
        scope,
        application_type: 'native',
        token_endpoint_auth_method: 'none',
        dpop_bound_access_tokens: true,
      },
      stateStore: opts.stateStore,
      sessionStore: opts.sessionStore,
      requestLock: opts.requestLock,
    })
  }

  if (!opts.keyset || opts.keyset.length === 0) {
    throw new Error('createOAuthClient: prod mode requires a non-empty keyset')
  }

  return new NodeOAuthClient({
    // The library's default fetch is unhardened for did:web documents and the
    // PDS/auth-server metadata lookups — URLs that come from a user-supplied
    // (attacker-controllable) DID document. Wrap with SSRF protection so those
    // fetches can't reach private/loopback/link-local ranges, with size/time
    // caps. Safe here because every internal call site sets `redirect`
    // explicitly. Dev mode must NOT use this: its PDS lives on 127.0.0.1.
    fetch: safeFetchWrap({ ssrfProtection: true }),
    clientMetadata: {
      client_id: `${opts.publicUrl}/client-metadata.json`,
      client_name: 'onrepeat.fm',
      client_uri: opts.publicUrl,
      redirect_uris: [redirectUri],
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      scope,
      application_type: 'web',
      token_endpoint_auth_method: 'private_key_jwt',
      token_endpoint_auth_signing_alg: 'ES256',
      dpop_bound_access_tokens: true,
      jwks_uri: `${opts.publicUrl}/.well-known/jwks.json`,
    },
    keyset: opts.keyset,
    stateStore: opts.stateStore,
    sessionStore: opts.sessionStore,
    requestLock: opts.requestLock,
  })
}
