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
  /**
   * Dev-only: resolve handles against this URL instead of public DNS/well-known.
   * Point at a local PDS (e.g. http://localhost:2583) so a `*.test` handle on a
   * local dev-env PDS resolves. Ignored in prod mode.
   */
  handleResolver?: string | URL
  /**
   * Dev-only: resolve `did:plc:*` against this PLC directory instead of
   * https://plc.directory. Point at a local PLC (e.g. http://localhost:2582).
   * When set, the dev client also enables `allowHttp` so it can talk to the
   * loopback PDS/auth-server over plain HTTP. Ignored in prod mode.
   */
  plcDirectoryUrl?: string | URL
}

export function createOAuthClient(
  opts: CreateOAuthClientOptions,
): NodeOAuthClient {
  const scope = opts.scope ?? DEFAULT_SCOPE
  // Normalize a trailing slash rather than trusting deploy config: a PUBLIC_URL
  // of 'https://x/' would otherwise derive 'https://x//oauth-client-metadata.json',
  // which the auth server fetches, hits our redirect-normalizing 308, and
  // rejects ("unexpected redirect" → invalid_client_metadata).
  const publicUrl = opts.publicUrl.replace(/\/+$/, '')
  const redirectUri = `${publicUrl}/oauth/callback`

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
      // Dev-only local-PDS wiring. Omitted → library defaults (DNS handle
      // resolution + plc.directory), i.e. today's behavior against real bsky.
      ...(opts.handleResolver ? { handleResolver: opts.handleResolver } : {}),
      ...(opts.plcDirectoryUrl
        ? { plcDirectoryUrl: opts.plcDirectoryUrl, allowHttp: true }
        : {}),
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
    // caps. allowImplicitRedirect is required: the client builds its PAR/token
    // Requests with the default redirect mode ('follow'), which the wrapper
    // would otherwise preemptively reject ("Request redirect must be ..."); the
    // unicast IP check runs at the undici dispatcher's connect-time lookup, so
    // redirect hops stay SSRF-protected regardless. Dev mode must NOT use this
    // wrapper: its PDS lives on 127.0.0.1.
    fetch: safeFetchWrap({ ssrfProtection: true, allowImplicitRedirect: true }),
    clientMetadata: {
      client_id: `${publicUrl}/oauth-client-metadata.json`,
      client_name: 'onrepeat.fm',
      client_uri: publicUrl,
      redirect_uris: [redirectUri],
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      scope,
      application_type: 'web',
      token_endpoint_auth_method: 'private_key_jwt',
      token_endpoint_auth_signing_alg: 'ES256',
      dpop_bound_access_tokens: true,
      jwks_uri: `${publicUrl}/.well-known/jwks.json`,
    },
    keyset: opts.keyset,
    stateStore: opts.stateStore,
    sessionStore: opts.sessionStore,
    requestLock: opts.requestLock,
  })
}
