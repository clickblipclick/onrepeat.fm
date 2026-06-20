import { NextResponse } from 'next/server'

import { getJam, type ActorProfile } from '@onrepeat/appview'

import { bsky, hydrate } from '../../../lib/appview'
import { db } from '../../../lib/db'
import { getSession } from '../../../lib/session'

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const uri = searchParams.get('uri')
  if (!uri) return NextResponse.json({ error: 'uri required' }, { status: 400 })
  const session = await getSession()
  try {
    const detail = await getJam(db, { uri, viewerDid: session.did })
    if (!detail)
      return NextResponse.json({ error: 'not found' }, { status: 404 })

    // Hydrate jam author + re-jam authors via the shared (already-degrading) helper.
    const [jam] = await hydrate([detail.jam])
    const reJams = await hydrate(detail.reJams)
    // Likers: hydrate to profiles, but degrade to DID-only on any bsky failure (enrichment, not required).
    let likers: (ActorProfile | { did: string })[]
    try {
      const likerProfiles = await bsky.getProfiles(detail.likerDids)
      likers = detail.likerDids.map((did) => likerProfiles.get(did) ?? { did })
    } catch (err) {
      console.error(
        '[web] /api/jam liker hydration failed; serving DID-only likers',
        err,
      )
      likers = detail.likerDids.map((did) => ({ did }))
    }
    return NextResponse.json({ jam, reJams, likers })
  } catch (err) {
    console.error('[web] /api/jam failed', err)
    return NextResponse.json({ error: 'internal error' }, { status: 500 })
  }
}
