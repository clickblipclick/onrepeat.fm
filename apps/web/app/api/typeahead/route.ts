import { AtpAgent } from '@atproto/api'
import { NextResponse } from 'next/server'

import { mapTypeahead } from '@/lib/typeahead'

// Same public, unauthenticated AppView the appview package uses (packages/appview/src/bsky.ts),
// with the same BSKY_PUBLIC_API_URL override (see apps/web/lib/appview.ts).
const PUBLIC_API = 'https://public.api.bsky.app'
const agent = new AtpAgent({
  service: process.env.BSKY_PUBLIC_API_URL || PUBLIC_API,
})

// Unauthenticated by design: this powers the pre-login handle autocomplete, so there is
// no session, and it returns only public Bluesky profile data (unlike the session-gated
// /api/track-search). Do not add a session gate here.
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const q = (searchParams.get('q') ?? '').trim()
  if (q.length < 2) return NextResponse.json({ actors: [] })
  try {
    const res = await agent.app.bsky.actor.searchActorsTypeahead({
      q,
      limit: 5,
    })
    return NextResponse.json({ actors: mapTypeahead(res.data.actors) })
  } catch (err) {
    // Best-effort — never 500 the login form; typing a full handle + Sign in still works.
    console.error('[web] /api/typeahead failed', err)
    return NextResponse.json({ actors: [] })
  }
}
