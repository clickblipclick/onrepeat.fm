import { NextResponse } from 'next/server'

import { getOauthClient } from '@/lib/oauth-client'

// Must not be prerendered: the metadata derives from runtime env, and evaluating the
// OAuth client at build time would trip the production env guards on local builds.
export const dynamic = 'force-dynamic'

export async function GET() {
  const oauthClient = await getOauthClient()
  // In prod this serves the document at the client_id URL. In dev (loopback) it is unused.
  return NextResponse.json(oauthClient.clientMetadata)
}
