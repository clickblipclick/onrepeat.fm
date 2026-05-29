import { NextResponse } from 'next/server'
import { oauthClient } from '../../lib/oauth-client'

export function GET() {
  // In prod this serves the document at the client_id URL. In dev (loopback) it is unused.
  return NextResponse.json(oauthClient.clientMetadata)
}
