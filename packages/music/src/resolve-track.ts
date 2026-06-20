import type { ProviderRefs } from '@onrepeat/db'

import type { ItunesClient } from './itunes'
import { isConfidentMatch } from './match'
import { youtubeVideoId, type YoutubeClient } from './youtube'

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
  /** Per-step trace for observability, e.g. ['apple:matched', 'youtube:no-match']. */
  notes: string[]
  /**
   * The iTunes anchor call threw (rate limit / 5xx / network / timeout) rather than
   * cleanly returning no match. The result is therefore incomplete by accident, not by
   * fact — callers should retry instead of persisting it as a final "resolved" state.
   */
  transient?: boolean
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
export async function resolveTrack(
  input: ResolveInput,
  deps: ResolveDeps,
): Promise<ResolutionResult> {
  const providerRefs: ProviderRefs = {}
  if (input.sourceProvider)
    providerRefs[input.sourceProvider] = { url: input.sourceUrl }

  const notes: string[] = []
  let transient = false
  let anchor: { title: string; artist: string; durationSec?: number } = {
    title: input.title,
    artist: input.artist,
  }
  let canonicalTitle: string | undefined
  let canonicalArtist: string | undefined
  let artworkUrl: string | undefined

  // --- Apple anchor (iTunes) ---
  try {
    let apple = null as Awaited<ReturnType<ItunesClient['lookup']>>
    if (input.sourceProvider === 'applemusic') {
      // Source is Apple: lookup is definitive; don't search for a substitute.
      const id = appleId(input.sourceUrl)
      if (id) apple = await deps.itunes.lookup(id)
      notes.push(apple ? 'apple:source' : 'apple:source-miss')
    } else {
      const candidates = await deps.itunes.search(
        `${input.title} ${input.artist}`,
      )
      apple =
        candidates.find((c) =>
          isConfidentMatch(
            { title: input.title, artist: input.artist },
            { title: c.title, artist: c.artist, durationSec: c.durationSec },
          ),
        ) ?? null
      notes.push(apple ? 'apple:matched' : 'apple:no-match')
    }
    if (apple) {
      if (input.sourceProvider !== 'applemusic')
        providerRefs.applemusic = { url: apple.sourceUrl }
      anchor = {
        title: apple.title,
        artist: apple.artist,
        durationSec: apple.durationSec,
      }
      canonicalTitle = apple.title
      canonicalArtist = apple.artist
      artworkUrl = apple.artworkUrl
    }
  } catch {
    // iTunes errored (rate limit / 5xx / network) — this is the resolution anchor, so the
    // result is unreliable. Mark transient so the caller retries rather than persisting it.
    notes.push('apple:error')
    transient = true
  }

  // --- YouTube ---
  const sourceIsYoutube =
    input.sourceProvider === 'youtube' ||
    input.sourceProvider === 'youtubemusic'
  if (!deps.youtube) {
    notes.push('youtube:skipped(no-key)')
  } else {
    try {
      if (sourceIsYoutube) {
        // Source already covers YouTube; don't cross-link (it would duplicate the ref
        // or overwrite the user's pasted video). Just check the source can embed — if
        // the uploader disabled it, mark the ref so the player falls back to link-out.
        const vid = youtubeVideoId(input.sourceUrl)
        const ref = input.sourceProvider
          ? providerRefs[input.sourceProvider]
          : undefined
        const meta = vid && ref ? await deps.youtube.lookupVideos([vid]) : null
        // `vid &&` lets TS narrow vid to string for meta.get; behaviour is unchanged
        // since meta is only non-null when vid was truthy in the first place.
        if (ref && vid && meta?.get(vid)?.embeddable === false) {
          ref.embeddable = false
          notes.push('youtube:source(not-embeddable)')
        } else {
          notes.push('youtube:source')
        }
      } else {
        const vids = await deps.youtube.searchVideo(
          `${anchor.title} ${anchor.artist}`,
        )
        if (!vids.length) {
          notes.push('youtube:no-results')
        } else {
          const meta = await deps.youtube.lookupVideos(
            vids.map((v) => v.videoId),
          )
          const match = vids.find((v) =>
            isConfidentMatch(anchor, {
              title: v.title,
              artist: v.channelTitle,
              durationSec: meta.get(v.videoId)?.durationSec,
            }),
          )
          if (!match) {
            notes.push('youtube:no-match')
          } else if (meta.get(match.videoId)?.embeddable === false) {
            // Don't add a cross-link that can't embed — it'd be a dead "YouTube" option.
            notes.push('youtube:not-embeddable')
          } else {
            providerRefs.youtube = { url: match.url }
            notes.push('youtube:matched')
          }
        }
      }
    } catch (err) {
      // Distinguish quota exhaustion (daily, not worth retrying) from a transient error.
      notes.push(
        err instanceof Error && err.message.includes('quota')
          ? 'youtube:quota'
          : 'youtube:error',
      )
    }
  }

  return {
    title: canonicalTitle,
    artist: canonicalArtist,
    artworkUrl,
    providerRefs,
    notes,
    transient,
  }
}
