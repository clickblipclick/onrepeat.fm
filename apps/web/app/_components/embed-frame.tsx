'use client'

import { useEffect, useState } from 'react'

import { LABELS, type Embed } from '../../lib/embed'
import { YouTubeEmbed } from './youtube-embed'

// Per-provider frame shape — the single source of truth for both contexts, so the
// in-card and corner players can't drift. Audio embeds are fixed-height bars
// (heights dictated by each provider's compact player); video is 16:9; unknown
// providers fall back to a square.
const VIDEO_PROVIDERS = new Set(['youtube', 'youtubemusic'])
const BAR_HEIGHTS: Record<string, string> = {
  spotify: 'h-[152px]',
  applemusic: 'h-[175px]',
  bandcamp: 'h-[120px]',
  soundcloud: 'h-[166px]',
  tidal: 'h-[120px]',
}

/** Tailwind size classes for an embed. In-card frames span the card (`w-full`); the
 *  pinned corner player fixes a width per shape (small 16:9 for video, one comfortable
 *  width for the audio bars). */
function frameSize(provider: string, context: 'card' | 'pinned'): string {
  const height = VIDEO_PROVIDERS.has(provider)
    ? 'aspect-video'
    : (BAR_HEIGHTS[provider] ?? 'aspect-square')
  const width =
    context === 'card'
      ? 'w-full'
      : BAR_HEIGHTS[provider]
        ? 'w-[440px]'
        : 'w-[320px]'
  return `${height} ${width}`
}

/** Renders a third-party embed with an explicit lifecycle: a pulsing skeleton while it
 *  loads, the embed once it reports ready, and a link-out to the provider's page when it
 *  fails — including when it never loads (tracker blockers routinely kill embed hosts).
 *  Hit-testable only once revealed, so the hidden frame never swallows clicks meant for
 *  whatever sits underneath. Sized by `context`; callers add positioning/shadow/rounding
 *  via `className`. Mount fresh per provider (key upstream) so the lifecycle resets on a
 *  service switch. */
export function EmbedFrame({
  embed,
  context,
  className = '',
}: {
  embed: Embed
  context: 'card' | 'pinned'
  className?: string
}) {
  const [state, setState] = useState<'loading' | 'ready' | 'failed'>('loading')

  // Plain iframes fire onLoad reliably, so a long silence means the embed host is
  // blocked or hung — fail over to the link-out instead of revealing a dead frame.
  useEffect(() => {
    const fallback = setTimeout(
      () => setState((s) => (s === 'loading' ? 'failed' : s)),
      6000,
    )
    return () => clearTimeout(fallback)
  }, [])

  const isYouTube = VIDEO_PROVIDERS.has(embed.provider)
  const fallbackHref = embed.kind === 'iframe' ? embed.fallbackHref : undefined
  const label = LABELS[embed.provider] ?? embed.provider

  return (
    <div
      className={`relative overflow-hidden ${frameSize(embed.provider, context)} ${className}`}
    >
      {state === 'failed' ? (
        fallbackHref ? (
          <a
            href={fallbackHref}
            target="_blank"
            rel="noreferrer"
            className="flex h-full w-full items-center justify-center bg-black/60 text-sm font-bold text-white"
          >
            open in {label} ↗
          </a>
        ) : (
          <span className="flex h-full w-full items-center justify-center bg-black/60 text-sm font-bold text-white">
            player unavailable
          </span>
        )
      ) : (
        <>
          {state === 'loading' && (
            <span
              aria-hidden
              className="absolute inset-0 animate-pulse bg-ink/10"
            />
          )}
          <div
            className={`h-full w-full transition-opacity duration-200 ${state === 'ready' ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0'}`}
          >
            {isYouTube ? (
              <YouTubeEmbed
                key={embed.kind === 'iframe' ? embed.videoId : ''}
                videoId={embed.kind === 'iframe' ? (embed.videoId ?? '') : ''}
                onReady={() => setState('ready')}
                onError={() => setState('failed')}
                className="block h-full w-full"
              />
            ) : (
              <iframe
                key={embed.provider}
                src={embed.kind === 'iframe' ? embed.src : undefined}
                title={embed.kind === 'iframe' ? embed.title : 'player'}
                onLoad={() => setState('ready')}
                className="block h-full w-full"
                // No `sandbox`: it breaks Bandcamp/Spotify/Apple/SoundCloud players. These are a
                // fixed allowlist of reputable services.
                allow="autoplay; encrypted-media; clipboard-write; fullscreen"
              />
            )}
          </div>
        </>
      )}
    </div>
  )
}
