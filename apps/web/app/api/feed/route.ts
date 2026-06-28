import { NextResponse } from 'next/server'

import { getFollowFeed, getFollowingDids } from '@onrepeat/appview'

import { hydrate } from '../../../lib/appview'
import { db } from '../../../lib/db'
import { getSession } from '../../../lib/session'

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const cursor = searchParams.get('cursor') ?? undefined
  const session = await getSession()
  if (!session.did)
    return NextResponse.json({ error: 'login required' }, { status: 401 })

  try {
    const followedDids = await getFollowingDids(db, session.did)
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
