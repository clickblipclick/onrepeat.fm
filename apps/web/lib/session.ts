import { getIronSession } from 'iron-session'
import { cookies } from 'next/headers'
import type { NextRequest, NextResponse } from 'next/server'
import { Agent } from '@atproto/api'
import { getOauthClient, getOauthSessionStore } from './oauth-client'
import { sessionOptions, type SessionData } from './session-config'

export * from './session-config'

/** Read the session from the request cookies (use in Server Components / read paths). */
export async function getSession() {
  return getIronSession<SessionData>(await cookies(), sessionOptions())
}

/**
 * Bind the session to an outgoing response so `save()`/`destroy()` write the
 * Set-Cookie onto THAT response. Required in Route Handlers that return a
 * hand-built NextResponse.redirect(), where cookies() mutations are dropped.
 */
export async function getResponseSession(req: NextRequest, res: NextResponse) {
  return getIronSession<SessionData>(req, res, sessionOptions())
}

/**
 * Resolve the viewer's authenticated agent:
 *  - `{ agent }` — ready to make authenticated calls.
 *  - `{ agent: null, reason: 'logged-out' }` — no session cookie.
 *  - `{ agent: null, reason: 'expired' }` — the OAuth session is gone/unrecoverable
 *    (atproto deleted the stored session); the cookie is cleared, re-auth required.
 *  - `{ agent: null, reason: 'transient' }` — restore() failed but the stored session
 *    survived (network/issuer blip); the session is kept so a retry can succeed.
 */
export type SessionAgentResult =
  | { agent: Agent }
  | { agent: null; reason: 'logged-out' | 'expired' | 'transient' }

export async function getSessionAgent(): Promise<SessionAgentResult> {
  const session = await getSession()
  if (!session.did) return { agent: null, reason: 'logged-out' }
  try {
    const oauthClient = await getOauthClient()
    const oauthSession = await oauthClient.restore(session.did)
    return { agent: new Agent(oauthSession) }
  } catch (err) {
    // atproto deletes the stored session when it's unrecoverable (revoked /
    // invalid_grant / invalid). If the row is gone, re-auth is required; if it
    // survived, the failure was transient — keep the session so a retry works.
    const stored = await getOauthSessionStore()
      .get(session.did)
      .catch(() => 'unknown' as const)
    if (stored === undefined) {
      console.error('[web] OAuth session expired/invalid; clearing cookie', err)
      session.destroy()
      return { agent: null, reason: 'expired' }
    }
    console.error(
      '[web] OAuth restore failed transiently; keeping session',
      err,
    )
    return { agent: null, reason: 'transient' }
  }
}
