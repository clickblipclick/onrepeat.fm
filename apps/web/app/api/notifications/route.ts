import { NextResponse } from 'next/server'

import { getNotifications } from '@onrepeat/appview'

import { hydrateNotifications } from '@/lib/appview'
import { db } from '@/lib/db'
import { getSession } from '@/lib/session'

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const cursor = searchParams.get('cursor') ?? undefined
  const session = await getSession()
  if (!session.did)
    return NextResponse.json({ error: 'login required' }, { status: 401 })

  try {
    const page = await getNotifications(db, { did: session.did, cursor })
    const notifications = await hydrateNotifications(page.notifications)
    return NextResponse.json({ notifications, cursor: page.cursor })
  } catch (err) {
    // 'invalid cursor' is the message thrown by decodeCursor in @onrepeat/appview (src/cursor.ts).
    if (err instanceof Error && err.message === 'invalid cursor') {
      return NextResponse.json({ error: 'invalid cursor' }, { status: 400 })
    }
    console.error('[web] /api/notifications failed', err)
    return NextResponse.json({ error: 'internal error' }, { status: 500 })
  }
}
