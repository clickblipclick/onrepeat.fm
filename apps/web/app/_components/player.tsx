'use client'

import { useEffect, useState } from 'react'
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
 *  (a cookie) when this jam offers it. */
export function Player({
  sourceProvider,
  providerRefs,
  sourceUrl,
  artworkUrl,
  lazy = true,
  preferredProvider,
}: {
  sourceProvider: string | null
  providerRefs: ProviderRefs
  sourceUrl: string
  artworkUrl: string | null
  lazy?: boolean
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

  function choose(p: string) {
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
  }, [playing])

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

  return (
    <div className="relative aspect-square w-full overflow-hidden">
      {/* One persistent cover: sharp on the poster, blurs in when the player opens and
          un-blurs when it closes (CSS transitions both directions off `playing`). */}
      {artworkUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={artworkUrl}
          alt=""
          decoding="async"
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
          {/* Click the cover (anywhere outside the embed) to dismiss and return to the chips. */}
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
                  allow="autoplay; encrypted-media; clipboard-write; fullscreen"
                />
              )}
            </div>
          </div>
        </>
      ) : (
        <>
          {/* bottom scrim so the platform buttons stay legible over any artwork */}
          <span
            aria-hidden
            className="absolute inset-x-0 bottom-0 h-2/5 bg-linear-to-t from-black/70 to-transparent"
          />
          <div className="absolute inset-x-0 bottom-0 flex flex-wrap items-center gap-1.5 p-2.5">
            {platforms.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => launch(p)}
                aria-label={`Play on ${LABELS[p] ?? p}`}
                className="flex items-center gap-1 rounded-full bg-black/55 px-3 py-1 text-xs font-bold text-white ring-1 ring-white/25 backdrop-blur-sm transition hover:bg-black/75 focus:outline-none focus-visible:ring-2 focus-visible:ring-white motion-safe:hover:scale-105"
              >
                <span aria-hidden>▶</span>
                {LABELS[p] ?? p}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
