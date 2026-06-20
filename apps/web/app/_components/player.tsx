'use client'

import { Play } from 'lucide-react'

import { DEFAULT_FRAME, EMBED_FRAME, EmbedFrame } from './embed-frame'
import { usePlayback } from './playback'
import { VinylPlaceholder } from './vinyl-placeholder'

/** Cross-platform player. Click-to-play poster. On desktop, play hands off to the persistent
 *  corner <PlayerHost> (this card just shows a "now playing" marker); on mobile, the embed
 *  opens in-card. Playback routing lives in <PlaybackProvider>. */
export function Player({
  artworkUrl,
  title,
  artist,
  priority = false,
}: {
  artworkUrl: string | null
  title: string
  artist: string
  priority?: boolean
}) {
  const { active, playing, isNowPlaying, isDesktop, play, close } =
    usePlayback()
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

  // Mobile shows the in-card embed when playing; desktop never does (it's in the corner host).
  const showInCard = !isDesktop && playing
  // Desktop highlights the card whose track is in the corner.
  const marker = isDesktop && isNowPlaying

  return (
    <div
      className={`relative aspect-square w-full overflow-hidden rounded ${marker ? 'ring-2 ring-accent ring-inset' : ''}`}
    >
      {artworkUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={artworkUrl}
          alt=""
          decoding="async"
          {...coverLoad}
          className={`absolute inset-0 h-full w-full object-cover transition duration-200 ${showInCard ? 'scale-110 blur-md' : 'blur-0 scale-100'}`}
        />
      )}
      <VinylPlaceholder />
      <span
        aria-hidden
        className={`absolute inset-0 bg-black/25 transition-opacity duration-200 ${showInCard ? 'opacity-100' : 'opacity-0'}`}
      />

      {showInCard ? (
        <>
          {/* Tap the cover (outside the embed) to dismiss and return to the poster. */}
          <button
            type="button"
            onClick={close}
            aria-label="Close player"
            className="cursor-close absolute inset-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-inset"
          />
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-4">
            <EmbedFrame
              key={active.provider}
              embed={active}
              sizeClass={EMBED_FRAME[active.provider] ?? DEFAULT_FRAME}
              className="pointer-events-auto shadow-2xl ring-1 ring-black/10"
            />
          </div>
        </>
      ) : marker ? (
        <span
          aria-label="Now playing"
          className="absolute bottom-2 left-2 flex h-7 w-7 items-center justify-center rounded-full bg-black/70 text-accent"
        >
          <Equalizer />
        </span>
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
            className="flex h-16 w-16 items-center justify-center rounded-full bg-black/20 text-white ring-1 ring-white/25 backdrop-blur-md transition duration-300 group-hover:backdrop-blur-sm group-focus-visible:ring-2 group-focus-visible:ring-white group-active:scale-95"
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

/** Animated equalizer bars — the "now playing" affordance. Inherits color via `currentColor`;
 *  bars hold still (full height) under prefers-reduced-motion. */
function Equalizer() {
  return (
    <span aria-hidden className="flex h-3.5 items-end gap-[2px]">
      {[0, 1, 2, 3].map((i) => (
        <span
          key={i}
          className="h-full w-[3px] origin-bottom rounded-full bg-current motion-safe:animate-[eq_0.9s_ease-in-out_infinite]"
          style={{ animationDelay: `${i * 0.15}s` }}
        />
      ))}
    </span>
  )
}
