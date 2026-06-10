'use client'

import { useEffect, useState } from 'react'
import { Play } from 'lucide-react'
import type { ProviderRefs } from '@onrepeat/db'
import {
  buildEmbed,
  embeddableProviders,
  LABELS,
  type Embed,
} from '../../lib/embed'
import {
  parseProvider,
  playbackCookieString,
} from '../../lib/playback-preference'
import { YouTubeEmbed } from './youtube-embed'
import { Menu } from './ui/menu'

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

/** Cross-platform player. Click-to-play by default (`lazy`): shows the album art as a
 *  poster and only mounts the third-party embed once the user hits play — keeps the art
 *  the focal point and avoids loading provider iframes (and their trackers) unbidden.
 *  Pass `lazy={false}` to mount immediately. Defaults to the viewer's preferred service
 *  (a cookie) when this jam offers it. One center play button starts the resolved service;
 *  the 'via … ▾' row under the art switches (and persists) the service. */
export function Player({
  sourceProvider,
  providerRefs,
  sourceUrl,
  artworkUrl,
  title,
  artist,
  lazy = true,
  priority = false,
  preferredProvider,
}: {
  sourceProvider: string | null
  providerRefs: ProviderRefs
  sourceUrl: string
  artworkUrl: string | null
  /** Track title/artist — used only for accessible labels ("Play {title} by {artist}"). */
  title: string
  artist: string
  lazy?: boolean
  /** Mark the cover as the LCP image (detail hero / first feed card): loads eagerly at
   *  high priority. Otherwise the cover defers with loading="lazy". */
  priority?: boolean
  preferredProvider?: string
}) {
  const def = buildEmbed(
    sourceProvider,
    providerRefs,
    sourceUrl,
    preferredProvider,
  )
  const others = embeddableProviders(providerRefs)
  // Platforms offered on the poster — the resolved embeddable refs, or the source
  // itself when nothing's resolved yet (def is always an iframe past the link guard).
  const platforms = others.length > 0 ? others : [def.provider]
  const [active, setActive] = useState<Embed>(def)
  const [playing, setPlaying] = useState(!lazy)
  const [loaded, setLoaded] = useState(false) // the embed iframe finished loading
  const [failed, setFailed] = useState(false) // YouTube embed errored (region/age/disabled)
  const ytId =
    active.kind === 'iframe'
      ? (active.src.match(/\/embed\/([^?]+)/)?.[1] ?? '')
      : ''
  const isYouTube =
    active.provider === 'youtube' || active.provider === 'youtubemusic'
  // Cover-image loading hint: the LCP candidate loads eagerly at high priority; all
  // other covers defer until near the viewport (per optimize-image-priority guidance).
  const coverLoad = priority
    ? ({ fetchPriority: 'high' } as const)
    : ({ loading: 'lazy' } as const)

  function choose(p: string) {
    // Switching providers remounts the embed — re-hide it until the new one loads.
    // (Guarded so re-picking the active service doesn't blank a loaded embed: the
    // iframe wouldn't remount, onLoad would never re-fire, and it'd hang hidden.)
    if (p !== active.provider) {
      setLoaded(false)
      setFailed(false)
    }
    setActive(buildEmbed(p, providerRefs, sourceUrl))
    const logical = parseProvider(p)
    if (logical) {
      // Persist the picked service as the default for future jams (read on next load).
      document.cookie = playbackCookieString(
        logical,
        location.protocol === 'https:',
      )
    }
  }

  /** Launch a specific platform from the poster: load its embed and start playing. */
  function launch(p: string) {
    choose(p)
    setPlaying(true)
  }

  // Reveal the embed only once it loads — with a fallback so it never stays hidden if
  // onLoad doesn't fire. Reset on close. (The blur in/out is pure CSS off `playing`.)
  useEffect(() => {
    if (!playing) {
      setLoaded(false)
      setFailed(false)
      return
    }
    const fallback = setTimeout(() => setLoaded(true), 4000)
    return () => clearTimeout(fallback)
  }, [playing, active.provider])

  if (def.kind === 'link') {
    return (
      <a
        href={def.href}
        target="_blank"
        rel="noreferrer"
        aria-label={`Open in ${def.provider}`}
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
          open in {def.provider} ↗
        </span>
      </a>
    )
  }

  const activeLabel = LABELS[active.provider] ?? active.provider

  return (
    <div className="w-full">
      <div className="relative aspect-square w-full overflow-hidden rounded">
        {/* One persistent cover: sharp on the poster, blurs in when the player opens and
            un-blurs when it closes (CSS transitions both directions off `playing`). */}
        {artworkUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={artworkUrl}
            alt=""
            decoding="async"
            {...coverLoad}
            className={`absolute inset-0 h-full w-full object-cover transition duration-200 ${playing ? 'scale-110 blur-md' : 'blur-0 scale-100'}`}
          />
        ) : (
          <span aria-hidden className="accent-grid absolute inset-0" />
        )}
        <span
          aria-hidden
          className={`absolute inset-0 bg-black/25 transition-opacity duration-200 ${playing ? 'opacity-100' : 'opacity-0'}`}
        />

        {playing ? (
          <>
            {/* Click the cover (anywhere outside the embed) to dismiss and return to the poster. */}
            <button
              type="button"
              onClick={() => setPlaying(false)}
              aria-label="Close player"
              className="absolute inset-0 cursor-zoom-out focus:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-inset"
            />
            {/* The embed floats over the blurred cover; pointer-events-none lets clicks on the
                surrounding art reach the close button, while the embed itself stays interactive. */}
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-4">
              <div
                className={`overflow-hidden rounded-xl shadow-2xl ring-1 ring-black/10 transition-opacity duration-200 ${loaded ? 'pointer-events-auto opacity-100' : 'opacity-0'} ${EMBED_FRAME[active.provider] ?? DEFAULT_FRAME}`}
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
                    key={active.provider}
                    src={active.kind === 'iframe' ? active.src : undefined}
                    title={active.kind === 'iframe' ? active.title : 'player'}
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
          </>
        ) : (
          <>
            {/* Center play button — plays the resolved service without touching the stored preference. */}
            <button
              type="button"
              onClick={() => setPlaying(true)}
              aria-label={`Play ${title} by ${artist}`}
              className="absolute inset-0 m-auto flex h-12 w-12 cursor-pointer items-center justify-center rounded-full bg-black/55 text-white ring-1 ring-white/25 backdrop-blur-sm transition hover:bg-black/75 focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
            >
              <Play
                size={20}
                fill="currentColor"
                aria-hidden
                className="translate-x-px"
              />
            </button>
          </>
        )}
      </div>

      {platforms.length > 1 && (
        <div className="flex justify-end pt-1">
          <Menu
            label={`via ${activeLabel} — change playback service`}
            triggerClassName="flex min-h-8 cursor-pointer items-center gap-1 rounded px-1.5 text-xs text-muted transition hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            items={platforms.map((p) => ({
              label: LABELS[p] ?? p,
              selected: p === active.provider,
              onSelect: () => launch(p),
            }))}
          >
            via {activeLabel} <span aria-hidden>▾</span>
          </Menu>
        </div>
      )}
    </div>
  )
}
