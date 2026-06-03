import type { ProviderRefs } from '@onrepeat/db'
import type { SpotifyClient } from './spotify'
import { extractSpotifyTrackId } from './spotify'
import type { YoutubeClient } from './youtube'
import { isConfidentMatch } from './match'

export interface ResolveInput {
  sourceUrl: string
  sourceProvider: string | null
  title: string
  artist: string
  isrc?: string | null
}

export interface ResolveDeps {
  spotify?: SpotifyClient
  youtube?: YoutubeClient
}

export interface ResolutionResult {
  title?: string
  artist?: string
  artworkUrl?: string
  isrc?: string
  providerRefs: ProviderRefs
}

/**
 * Spotify-anchored resolution. The source platform is always included (embeddable
 * from its own URL). A confident Spotify hit becomes the canonical anchor (ISRC +
 * duration + metadata); YouTube is added only when it confidently matches that
 * anchor. Each provider is best-effort: a missing client or an error skips just
 * that provider — the result always carries at least the source ref.
 */
export async function resolveTrack(input: ResolveInput, deps: ResolveDeps): Promise<ResolutionResult> {
  const providerRefs: ProviderRefs = {}
  if (input.sourceProvider) providerRefs[input.sourceProvider] = { url: input.sourceUrl }

  let anchor: { title: string; artist: string; durationSec?: number } = { title: input.title, artist: input.artist }
  let isrc = input.isrc ?? undefined
  let canonicalTitle: string | undefined
  let canonicalArtist: string | undefined
  let artworkUrl: string | undefined

  if (deps.spotify) {
    try {
      let sp = null as Awaited<ReturnType<SpotifyClient['lookupTrack']>>
      if (input.sourceProvider === 'spotify') {
        const id = extractSpotifyTrackId(input.sourceUrl)
        if (id) sp = await deps.spotify.lookupTrack(id)
        // Source is Spotify: lookup is definitive. If it yields nothing, do NOT
        // search for a substitute (that could link a different recording).
      } else {
        const candidates = await deps.spotify.searchTrack(`${input.title} ${input.artist}`)
        sp =
          candidates.find((c) =>
            isConfidentMatch(
              { title: input.title, artist: input.artist },
              { title: c.title, artist: c.artist, durationSec: Math.round(c.durationMs / 1000) },
            ),
          ) ?? null
      }
      if (sp) {
        providerRefs.spotify = { url: sp.url }
        anchor = { title: sp.title, artist: sp.artist, durationSec: Math.round(sp.durationMs / 1000) }
        isrc = sp.isrc ?? isrc
        canonicalTitle = sp.title
        canonicalArtist = sp.artist
        artworkUrl = sp.artworkUrl
      }
    } catch {
      // Spotify unavailable for this job — skip, keep going.
    }
  }

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

  return { title: canonicalTitle, artist: canonicalArtist, artworkUrl, isrc, providerRefs }
}
