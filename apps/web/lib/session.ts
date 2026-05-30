import { getIronSession } from 'iron-session'
import { cookies } from 'next/headers'
import type { NextRequest, NextResponse } from 'next/server'
import { Agent } from '@atproto/api'
import { oauthClient } from './oauth-client'
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

/** Restore the OAuth session for the logged-in DID and return an authenticated Agent. */
export async function getSessionAgent(): Promise<Agent | null> {
  const session = await getSession()
  if (!session.did) return null
  try {
    const oauthSession = await oauthClient.restore(session.did)
    return new Agent(oauthSession)
  } catch {
    session.destroy()
    return null
  }
}
