import { providerFromUrl } from '@onrepeat/core'
import { createOdesliClient, type OdesliClient } from './odesli'

/** A normalized track the picker can post: enough to build a jam record. */
export interface TrackCandidate {
  title: string
  artist: string
  artworkUrl?: string
  sourceUrl: string
  provider: string
}

/** Derive a candidate from a music URL via Odesli. Returns null ONLY when Odesli
 *  positively reports no match (or returns no title); THROWS on network/transient
 *  Odesli errors (callers wanting a soft failure should catch). */
export async function deriveTrack(url: string, client?: OdesliClient): Promise<TrackCandidate | null> {
  const odesli = client ?? createOdesliClient()
  const res = await odesli.resolve(url)
  if (res.notFound || !res.title) return null
  return {
    title: res.title,
    artist: res.artist ?? '',
    artworkUrl: res.artworkUrl,
    sourceUrl: url,
    provider: providerFromUrl(url) ?? 'unknown',
  }
}
