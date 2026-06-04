import type { ProviderRefs } from '@onrepeat/db'
import type { ItunesClient } from './itunes'
import type { YoutubeClient } from './youtube'
import { isConfidentMatch } from './match'

export interface ResolveInput {
  sourceUrl: string
  sourceProvider: string | null
  title: string
  artist: string
}

export interface ResolveDeps {
  /** iTunes/Apple — keyless, always available; the resolution anchor (provides duration). */
  itunes: ItunesClient
  /** YouTube Data API — optional (needs a key); skipped if absent. */
  youtube?: YoutubeClient
}

export interface ResolutionResult {
  title?: string
  artist?: string
  artworkUrl?: string
  providerRefs: ProviderRefs
}

/** Apple Music track URLs carry the song id in the `i` query param. */
function appleId(url: string): string | null {
  try {
    return new URL(url).searchParams.get('i')
  } catch {
    return null
  }
}

/**
 * iTunes/Apple-anchored resolution. The source platform is always embeddable from
 * its own URL. A confident iTunes match becomes the canonical anchor (Apple Music
 * URL + duration + metadata); YouTube is added only when it confidently matches
 * that anchor. Each provider is best-effort: a missing/erroring client skips just
 * that provider — the result always carries at least the source ref. No ISRC.
 */
export async function resolveTrack(input: ResolveInput, deps: ResolveDeps): Promise<ResolutionResult> {
  const providerRefs: ProviderRefs = {}
  if (input.sourceProvider) providerRefs[input.sourceProvider] = { url: input.sourceUrl }

  let anchor: { title: string; artist: string; durationSec?: number } = { title: input.title, artist: input.artist }
  let canonicalTitle: string | undefined
  let canonicalArtist: string | undefined
  let artworkUrl: string | undefined

  // --- Apple anchor (iTunes) ---
  try {
    let apple = null as Awaited<ReturnType<ItunesClient['lookup']>>
    if (input.sourceProvider === 'applemusic') {
      const id = appleId(input.sourceUrl)
      if (id) apple = await deps.itunes.lookup(id)
      // Source is Apple: lookup is definitive; don't search for a substitute.
    } else {
      const candidates = await deps.itunes.search(`${input.title} ${input.artist}`)
      apple =
        candidates.find((c) =>
          isConfidentMatch(
            { title: input.title, artist: input.artist },
            { title: c.title, artist: c.artist, durationSec: c.durationSec },
          ),
        ) ?? null
    }
    if (apple) {
      if (input.sourceProvider !== 'applemusic') providerRefs.applemusic = { url: apple.sourceUrl }
      anchor = { title: apple.title, artist: apple.artist, durationSec: apple.durationSec }
      canonicalTitle = apple.title
      canonicalArtist = apple.artist
      artworkUrl = apple.artworkUrl
    }
  } catch {
    // iTunes unavailable for this job — skip Apple, keep going.
  }

  // --- YouTube (validated against anchor) ---
  if (deps.youtube) {
    try {
      const vids = await deps.youtube.searchVideo(`${anchor.title} ${anchor.artist}`)
      if (vids.length) {
        const durations = await deps.youtube.lookupDurations(vids.map((v) => v.videoId))
        const match = vids.find((v) =>
          isConfidentMatch(anchor, { title: v.title, artist: v.channelTitle, durationSec: durations.get(v.videoId) }),
        )
        if (match) providerRefs.youtube = { url: match.url }
      }
    } catch {
      // YouTube unavailable/quota — skip.
    }
  }

  return { title: canonicalTitle, artist: canonicalArtist, artworkUrl, providerRefs }
}
