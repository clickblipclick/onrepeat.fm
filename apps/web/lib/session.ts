import { getIronSession } from 'iron-session'
import { cookies } from 'next/headers'
import { Agent } from '@atproto/api'
import { oauthClient } from './oauth-client'
import { sessionOptions, type SessionData } from './session-config'

export * from './session-config'

export async function getSession() {
  return getIronSession<SessionData>(await cookies(), sessionOptions())
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
