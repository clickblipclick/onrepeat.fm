import { NextResponse } from 'next/server'
import { getActorJams } from '@onrepeat/appview'
import { db } from '../../../../lib/db'
import { hydrate } from '../../../../lib/appview'
import { getSession } from '../../../../lib/session'

export async function GET(req: Request, ctx: { params: Promise<{ did: string }> }) {
  const { did } = await ctx.params
  const { searchParams } = new URL(req.url)
  const cursor = searchParams.get('cursor') ?? undefined
  const session = await getSession()
  try {
    const page = await getActorJams(db, { did, viewerDid: session.did, cursor })
    const jams = await hydrate(page.jams)
    // Response key is `jams` (a profile's own archive), intentionally distinct from the curated `feed` of /api/latest and /api/feed.
    return NextResponse.json({ jams, cursor: page.cursor })
  } catch (err) {
    // 'invalid cursor' is the message thrown by decodeCursor in @onrepeat/appview (src/cursor.ts).
    if (err instanceof Error && err.message === 'invalid cursor') {
      return NextResponse.json({ error: 'invalid cursor' }, { status: 400 })
    }
    console.error('[web] /api/actor failed', err)
    return NextResponse.json({ error: 'internal error' }, { status: 500 })
  }
}
