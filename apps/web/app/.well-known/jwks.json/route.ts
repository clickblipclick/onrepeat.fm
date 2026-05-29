import { NextResponse } from 'next/server'
import { oauthClient } from '../../../lib/oauth-client'

export function GET() {
  // `jwks` is present only for confidential (prod) clients with a keyset.
  return NextResponse.json(oauthClient.jwks ?? { keys: [] })
}
