import { ImageResponse } from 'next/og'

import { getJam } from '@onrepeat/appview'
import { isTrustedArtworkUrl } from '@onrepeat/core'

import {
  loadOgFonts,
  OG_SIZE,
  RepeatBrandCard,
  RepeatJamCard,
} from '../../../../_og/repeat-card'
import { bsky, hydrate } from '../../../../../lib/appview'
import { db } from '../../../../../lib/db'

export const runtime = 'nodejs'
export const size = OG_SIZE
export const contentType = 'image/png'
export const alt = 'A jam on onrepeat.fm'

// Inlined to match page.tsx (canonical source: JAM_NSID in @onrepeat/lexicons).
const JAM_NSID = 'fm.onrepeat.jam'

export default async function Image({
  params,
}: {
  params: Promise<{ handle: string; rkey: string }>
}) {
  let fonts: Awaited<ReturnType<typeof loadOgFonts>> | undefined
  try {
    fonts = await loadOgFonts()
  } catch {
    // fonts unavailable on disk — still return an image (system fallback font)
  }
  const { handle, rkey } = await params
  const actor = decodeURIComponent(handle)

  // An OG image route must always return an image — never notFound(). On any miss
  // or error (unresolvable actor, missing jam, hydrate/db failure) fall back to the
  // brand card.
  let card = <RepeatBrandCard />
  try {
    // `handle` is a handle (pretty links) or a DID (older/shared links). Records are
    // keyed by DID, so resolve a handle to its DID before building the at-uri.
    const authorDid = actor.startsWith('did:')
      ? actor
      : ((await bsky.getProfile(actor))?.did ?? null)
    if (authorDid) {
      const uri = `at://${authorDid}/${JAM_NSID}/${decodeURIComponent(rkey)}`
      const detail = await getJam(db, { uri })
      if (detail) {
        const [hydrated] = await hydrate([detail.jam])
        // hydrate preserves array length, but the destructure type is `… | undefined`; guard narrows it.
        if (hydrated) {
          // `artworkUrl` is attacker-controlled (any jam record, lexicon only enforces
          // `format: uri`) and satori fetches it server-side at the Node runtime — so
          // only pass it through when it's an https URL on a known art CDN, else the
          // card renders its brand placeholder. Prevents SSRF via this public route.
          const artworkUrl = isTrustedArtworkUrl(hydrated.artworkUrl)
            ? hydrated.artworkUrl
            : null
          card = (
            <RepeatJamCard
              title={hydrated.title}
              artist={hydrated.artist}
              artworkUrl={artworkUrl}
              theme={hydrated.author.theme}
            />
          )
        }
      }
    }
  } catch {
    // fall through to the brand card
  }

  return new ImageResponse(card, { ...OG_SIZE, ...(fonts ? { fonts } : {}) })
}
