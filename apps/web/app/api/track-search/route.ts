import { NextResponse } from 'next/server'
import { searchTracks } from '@onrepeat/music'
import { getSession } from '../../../lib/session'

export async function GET(req: Request) {
  const session = await getSession()
  if (!session.did) return NextResponse.json({ results: [] })
  const { searchParams } = new URL(req.url)
  const q = searchParams.get('q') ?? ''
  if (q.trim().length < 2) return NextResponse.json({ results: [] })
  try {
    const results = await searchTracks(q)
    return NextResponse.json({ results })
  } catch (err) {
    // Best-effort — never 500 the picker; the user can paste a link or enter manually.
    console.error('[web] /api/track-search failed', err)
    return NextResponse.json({ results: [] })
  }
}
