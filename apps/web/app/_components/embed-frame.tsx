'use client'

import { useEffect, useState } from 'react'

import { type Embed } from '../../lib/embed'
import { YouTubeEmbed } from './youtube-embed'

// In-card sizes (inside the square cover frame): bars get a fixed height, video is 16:9,
// everything else stays square.
export const EMBED_FRAME: Record<string, string> = {
  youtube: 'aspect-video w-full',
  youtubemusic: 'aspect-video w-full',
  spotify: 'h-[152px] w-full',
  applemusic: 'h-[175px] w-full',
  bandcamp: 'h-[120px] w-full',
  soundcloud: 'h-[166px] w-full',
}
export const DEFAULT_FRAME = 'aspect-square w-full'

// Corner mini-player sizes. Video is a small 16:9; the audio bars share one comfortable width.
export const PINNED_FRAME: Record<string, string> = {
  youtube: 'aspect-video w-[320px]',
  youtubemusic: 'aspect-video w-[320px]',
  spotify: 'h-[152px] w-[440px]',
  applemusic: 'h-[175px] w-[440px]',
  bandcamp: 'h-[120px] w-[440px]',
  soundcloud: 'h-[166px] w-[440px]',
}
export const DEFAULT_PINNED = 'aspect-square w-[320px]'

/** Renders a third-party embed, revealing it only once it loads (with a 4s fallback so it
 *  never stays hidden), and falling back to a link-out when YouTube refuses to play. Sized by
 *  `sizeClass`; callers add positioning/shadow/rounding via `className` (rounding lives with
 *  the caller so a framed context can pick a radius concentric with its frame). Mount fresh
 *  per provider (key upstream) so the load gate resets on a service switch. */
export function EmbedFrame({
  embed,
  sizeClass,
  className = '',
}: {
  embed: Embed
  sizeClass: string
  className?: string
}) {
  const [loaded, setLoaded] = useState(false)
  const [failed, setFailed] = useState(false)
  const ytId =
    embed.kind === 'iframe'
      ? (embed.src.match(/\/embed\/([^?]+)/)?.[1] ?? '')
      : ''
  const isYouTube =
    embed.provider === 'youtube' || embed.provider === 'youtubemusic'

  useEffect(() => {
    const fallback = setTimeout(() => setLoaded(true), 4000)
    return () => clearTimeout(fallback)
  }, [])

  return (
    <div
      // Hit-testable only once revealed: while hidden the frame must not swallow clicks
      // meant for whatever sits underneath (e.g. the card's full-cover close button).
      className={`overflow-hidden transition-opacity duration-200 ${loaded ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0'} ${sizeClass} ${className}`}
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
          // No `sandbox`: it breaks Bandcamp/Spotify/Apple/SoundCloud players. These are a
          // fixed allowlist of reputable services.
          allow="autoplay; encrypted-media; clipboard-write; fullscreen"
        />
      )}
    </div>
  )
}
