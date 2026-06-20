import { NextResponse } from 'next/server'

import { getFollowFeed } from '@onrepeat/appview'

import { bsky, hydrate } from '../../../lib/appview'
import { db } from '../../../lib/db'
import { getSession } from '../../../lib/session'

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const cursor = searchParams.get('cursor') ?? undefined
  const session = await getSession()
  if (!session.did)
    return NextResponse.json({ error: 'login required' }, { status: 401 })

  // The follow graph comes from the upstream bsky service; if it's unavailable the feed
  // genuinely cannot be assembled → 502 (bad gateway), distinct from a local failure.
  let followedDids: string[]
  try {
    followedDids = await bsky.getFollows(session.did)
  } catch (err) {
    console.error('[web] /api/feed getFollows failed', err)
    return NextResponse.json({ error: 'failed to build feed' }, { status: 502 })
  }

  try {
    const page = await getFollowFeed(db, {
      followedDids,
      viewerDid: session.did,
      cursor,
    })
    const feed = await hydrate(page.jams)
    return NextResponse.json({ feed, cursor: page.cursor })
  } catch (err) {
    // 'invalid cursor' is the message thrown by decodeCursor in @onrepeat/appview (src/cursor.ts).
    if (err instanceof Error && err.message === 'invalid cursor') {
      return NextResponse.json({ error: 'invalid cursor' }, { status: 400 })
    }
    console.error('[web] /api/feed failed', err)
    return NextResponse.json({ error: 'internal error' }, { status: 500 })
  }
}
