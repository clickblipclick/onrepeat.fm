'use client'

import { Play } from 'lucide-react'
import { useEffect, useState } from 'react'

import { type Embed } from '../../lib/embed'
import { usePlayback } from './playback'
import { VinylPlaceholder } from './vinyl-placeholder'
import { YouTubeEmbed } from './youtube-embed'

// Reasonable embed dimensions per provider, sized inside the square cover frame:
// "bar" players get a fixed height, video gets 16:9, everything else stays square.
const EMBED_FRAME: Record<string, string> = {
  youtube: 'aspect-video w-full',
  youtubemusic: 'aspect-video w-full',
  spotify: 'h-[152px] w-full',
  applemusic: 'h-[175px] w-full',
  bandcamp: 'h-[120px] w-full',
}
const DEFAULT_FRAME = 'aspect-square w-full'

/** Cross-platform player. Click-to-play by default: shows the album art as a poster and
 *  only mounts the third-party embed once the user hits play — keeps the art the focal
 *  point and avoids loading provider iframes (and their trackers) unbidden. Playback
 *  state (service + playing) lives in the surrounding <PlaybackProvider>, shared with
 *  the "via … ▾" switcher rendered beside the title/artist. */
export function Player({
  artworkUrl,
  title,
  artist,
  priority = false,
}: {
  artworkUrl: string | null
  /** Track title/artist — used only for accessible labels ("Play {title} by {artist}"). */
  title: string
  artist: string
  /** Mark the cover as the LCP image (detail hero / first feed card): loads eagerly at
   *  high priority. Otherwise the cover defers with loading="lazy". */
  priority?: boolean
}) {
  const { active, playing, play, close } = usePlayback()
  // Cover-image loading hint: the LCP candidate loads eagerly at high priority; all
  // other covers defer until near the viewport (per optimize-image-priority guidance).
  const coverLoad = priority
    ? ({ fetchPriority: 'high' } as const)
    : ({ loading: 'lazy' } as const)

  if (active.kind === 'link') {
    return (
      <a
        href={active.href}
        target="_blank"
        rel="noreferrer"
        aria-label={`Open in ${active.provider}`}
        className="relative block aspect-square w-full overflow-hidden"
      >
        {artworkUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={artworkUrl}
            alt=""
            decoding="async"
            {...coverLoad}
            className="h-full w-full object-cover"
          />
        ) : (
          <span className="accent-grid block h-full w-full" />
        )}
        <span className="absolute inset-0 flex items-center justify-center bg-black/40 text-sm font-bold text-white">
          open in {active.provider} ↗
        </span>
      </a>
    )
  }

  return (
    <div className="relative aspect-square w-full overflow-hidden rounded">
      {/* One persistent cover: sharp on the poster, blurs in when the player opens and
          un-blurs when it closes (CSS transitions both directions off `playing`). */}
      {artworkUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={artworkUrl}
          alt=""
          decoding="async"
          {...coverLoad}
          className={`absolute inset-0 h-full w-full object-cover transition duration-200 ${playing ? 'scale-110 blur-md' : 'blur-0 scale-100'}`}
        />
      )}
      <VinylPlaceholder />
      <span
        aria-hidden
        className={`absolute inset-0 bg-black/25 transition-opacity duration-200 ${playing ? 'opacity-100' : 'opacity-0'}`}
      />

      {playing ? (
        <>
          {/* Click the cover (anywhere outside the embed) to dismiss and return to the poster. */}
          <button
            type="button"
            onClick={close}
            aria-label="Close player"
            className="cursor-close absolute inset-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-inset"
          />
          {/* Keyed by provider: a mid-play service switch remounts the box, resetting its
              load gate so the incoming embed stays hidden until it actually loads. */}
          <EmbedBox key={active.provider} embed={active} />
        </>
      ) : (
        // The whole cover is the play target — plays the resolved service without touching
        // the stored preference (only an explicit switcher pick persists). Hovering anywhere
        // over the art darkens the centered badge (a `group`), so the entire square reads as
        // clickable. The badge keeps the same legibility treatment over arbitrary art:
        // dark circle + blur + ring.
        <button
          type="button"
          onClick={play}
          aria-label={`Play ${title} by ${artist}`}
          className="cursor-play group absolute inset-0 flex items-center justify-center focus:outline-none"
        >
          <span
            aria-hidden
            className="flex h-12 w-12 items-center justify-center rounded-full bg-black/55 text-white ring-1 ring-white/25 backdrop-blur-sm transition group-hover:bg-black/75 group-focus-visible:ring-2 group-focus-visible:ring-white"
          >
            <Play
              size={20}
              fill="currentColor"
              aria-hidden
              className="translate-x-px"
            />
          </span>
        </button>
      )}
    </div>
  )
}

/** The floating embed: reveals only once the third-party player loads (with a fallback
 *  so it never stays hidden), and falls back to a link-out when YouTube refuses to play.
 *  Mounted fresh per provider (keyed upstream), so its load gate starts hidden. */
function EmbedBox({ embed }: { embed: Embed }) {
  const [loaded, setLoaded] = useState(false) // the embed iframe finished loading
  const [failed, setFailed] = useState(false) // YouTube embed errored (region/age/disabled)
  const ytId =
    embed.kind === 'iframe'
      ? (embed.src.match(/\/embed\/([^?]+)/)?.[1] ?? '')
      : ''
  const isYouTube =
    embed.provider === 'youtube' || embed.provider === 'youtubemusic'

  // Reveal the embed only once it loads — with a fallback so it never stays hidden if
  // onLoad doesn't fire. (The blur in/out is pure CSS off `playing` in the Player.)
  useEffect(() => {
    const fallback = setTimeout(() => setLoaded(true), 4000)
    return () => clearTimeout(fallback)
  }, [])

  return (
    /* The embed floats over the blurred cover; pointer-events-none lets clicks on the
       surrounding art reach the close button, while the embed itself stays interactive. */
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-4">
      <div
        className={`overflow-hidden rounded-xl shadow-2xl ring-1 ring-black/10 transition-opacity duration-200 ${loaded ? 'pointer-events-auto opacity-100' : 'opacity-0'} ${EMBED_FRAME[embed.provider] ?? DEFAULT_FRAME}`}
      >
        {isYouTube ? (
          failed ? (
            <a
              href={`https://www.youtube.com/watch?v=${ytId}`}
              target="_blank"
              rel="noreferrer"
              className="flex h-full w-full items-center justify-center bg-black/60 text-sm font-bold text-white"
            >
              open in YouTube ↗
            </a>
          ) : (
            <YouTubeEmbed
              key={ytId}
              videoId={ytId}
              onReady={() => setLoaded(true)}
              onError={() => {
                setFailed(true)
                setLoaded(true)
              }}
              className="block h-full w-full"
            />
          )
        ) : (
          <iframe
            key={embed.provider}
            src={embed.kind === 'iframe' ? embed.src : undefined}
            title={embed.kind === 'iframe' ? embed.title : 'player'}
            onLoad={() => setLoaded(true)}
            className="block h-full w-full"
            // No `sandbox` here: it broke the Bandcamp/Spotify/Apple/SoundCloud players
            // (their EmbeddedPlayers need capabilities a sandbox strips). These are a
            // fixed allowlist of reputable services, so the defense-in-depth wasn't worth
            // breaking playback.
            allow="autoplay; encrypted-media; clipboard-write; fullscreen"
          />
        )}
      </div>
    </div>
  )
}
