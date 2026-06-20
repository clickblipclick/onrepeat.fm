import { NextRequest, NextResponse } from 'next/server'

import { getOauthClient } from '../../lib/oauth-client'
import { getResponseSession } from '../../lib/session'
import { APP_URL } from '../../lib/session-config'

export async function POST(req: NextRequest) {
  // 303 See Other: switch the POST to a GET of the home page (pinned to 127.0.0.1).
  const res = NextResponse.redirect(new URL('/', APP_URL), 303)
  // Bind to the response so the cookie-clearing Set-Cookie is attached to the redirect.
  const session = await getResponseSession(req, res)
  const did = session.did
  session.destroy()
  // Revoke the grant at the auth server and drop the stored OAuth session, so logout
  // actually invalidates the refresh token instead of just clearing the cookie. Best-effort:
  // a network failure here shouldn't block the user from logging out locally.
  if (did) {
    try {
      const oauthClient = await getOauthClient()
      await oauthClient.revoke(did)
    } catch (err) {
      console.error('[web] /logout token revocation failed', err)
    }
  }
  return res
}
