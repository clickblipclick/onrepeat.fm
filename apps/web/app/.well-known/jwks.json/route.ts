import { NextResponse } from 'next/server'

import { getOauthClient } from '../../../lib/oauth-client'

// Must not be prerendered: keys come from runtime env, and evaluating the OAuth
// client at build time would trip the production env guards on local builds.
export const dynamic = 'force-dynamic'

export async function GET() {
  const oauthClient = await getOauthClient()
  // `jwks` is present only for confidential (prod) clients with a keyset.
  return NextResponse.json(oauthClient.jwks ?? { keys: [] })
}
