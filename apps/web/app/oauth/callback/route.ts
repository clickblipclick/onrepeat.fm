import { NextRequest, NextResponse } from 'next/server'
import { oauthClient } from '../../../lib/oauth-client'
import { getSession } from '../../../lib/session'

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams
  const { session: oauthSession } = await oauthClient.callback(params)
  const session = await getSession()
  session.did = oauthSession.did
  await session.save()
  return NextResponse.redirect(new URL('/', req.url))
}
