import { NextRequest, NextResponse } from 'next/server'
import { getResponseSession } from '../../lib/session'
import { APP_URL } from '../../lib/session-config'

export async function POST(req: NextRequest) {
  // 303 See Other: switch the POST to a GET of the home page (pinned to 127.0.0.1).
  const res = NextResponse.redirect(new URL('/', APP_URL), 303)
  // Bind to the response so the cookie-clearing Set-Cookie is attached to the redirect.
  const session = await getResponseSession(req, res)
  session.destroy()
  return res
}
