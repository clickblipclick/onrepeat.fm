import { NextRequest, NextResponse } from 'next/server'
import { oauthClient } from '../../../lib/oauth-client'
import { getResponseSession } from '../../../lib/session'
import { APP_URL } from '../../../lib/session-config'

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams
  const { session: oauthSession } = await oauthClient.callback(params)
  // Bind the session to THIS response so the Set-Cookie is attached to the redirect.
  // Redirect to APP_URL (127.0.0.1), NOT req.url (which Next reports as localhost in dev).
  const res = NextResponse.redirect(new URL('/', APP_URL))
  const session = await getResponseSession(req, res)
  session.did = oauthSession.did
  await session.save()
  return res
}
