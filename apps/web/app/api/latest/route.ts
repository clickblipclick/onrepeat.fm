import { NextResponse } from 'next/server'

import { getLatest } from '@onrepeat/appview'

import { hydrate } from '../../../lib/appview'
import { db } from '../../../lib/db'
import { getSession } from '../../../lib/session'

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const cursor = searchParams.get('cursor') ?? undefined
  const session = await getSession()
  try {
    const page = await getLatest(db, { viewerDid: session.did, cursor })
    const feed = await hydrate(page.jams)
    return NextResponse.json({ feed, cursor: page.cursor })
  } catch (err) {
    // 'invalid cursor' is the message thrown by decodeCursor in @onrepeat/appview (src/cursor.ts).
    if (err instanceof Error && err.message === 'invalid cursor') {
      return NextResponse.json({ error: 'invalid cursor' }, { status: 400 })
    }
    console.error('[web] /api/latest failed', err)
    return NextResponse.json({ error: 'internal error' }, { status: 500 })
  }
}
