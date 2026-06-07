import { NextRequest, NextResponse } from 'next/server'
import { oauthClient } from '../../../lib/oauth-client'
import { APP_URL } from '../../../lib/session-config'

export async function POST(req: NextRequest) {
  const form = await req.formData()
  const handle = String(form.get('handle') ?? '').trim()
  // Bad/empty/unresolvable handles (and transient resolution failures) come back to the
  // login form with a message rather than erroring — see login/page.tsx ?error handling.
  if (!handle) {
    return NextResponse.redirect(new URL('/login?error=handle', APP_URL), 303)
  }
  let url: URL
  try {
    url = await oauthClient.authorize(handle)
  } catch (err) {
    console.error('[web] /oauth/login authorize failed', err)
    return NextResponse.redirect(new URL('/login?error=handle', APP_URL), 303)
  }
  // 303 See Other: force the browser to GET the authorization endpoint
  // (default redirect is 307, which would re-POST to /oauth/authorize).
  return NextResponse.redirect(url.toString(), 303)
}
