import { NextRequest, NextResponse } from 'next/server'

import { getOauthClient } from '../../../lib/oauth-client'
import { getResponseSession } from '../../../lib/session'
import { APP_URL } from '../../../lib/session-config'

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams
  let oauthSession
  try {
    const oauthClient = await getOauthClient()
    ;({ session: oauthSession } = await oauthClient.callback(params))
  } catch (err) {
    // The token exchange can fail (e.g. a network timeout to the auth server, or a
    // stale/replayed code). Don't 500 — send the user back to a retryable login screen.
    console.error('[web] /oauth/callback failed', err)
    return NextResponse.redirect(new URL('/login?error=auth', APP_URL), 303)
  }
  // Bind the session to THIS response so the Set-Cookie is attached to the redirect.
  // Redirect to APP_URL (127.0.0.1), NOT req.url (which Next reports as localhost in dev).
  const res = NextResponse.redirect(new URL('/', APP_URL))
  const session = await getResponseSession(req, res)
  session.did = oauthSession.did
  await session.save()
  return res
}
