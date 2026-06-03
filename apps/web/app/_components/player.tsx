'use client'

import { useState } from 'react'
import type { ProviderRefs } from '@onrepeat/db'
import { buildEmbed, embeddableProviders, resolvePreferredKey, type Embed } from '../../lib/embed'
import { parseProvider, playbackCookieString } from '../../lib/playback-preference'

/** Lazy cross-platform player. In `lazy` mode (feeds) it shows the artwork until
 *  the user hits play; otherwise it mounts the default embed immediately. Defaults
 *  to the viewer's preferred service (a cookie) when this jam offers it. */
export function Player({
  sourceProvider,
  providerRefs,
  sourceUrl,
  artworkUrl,
  lazy = false,
  preferredProvider,
}: {
  sourceProvider: string | null
  providerRefs: ProviderRefs
  sourceUrl: string
  artworkUrl: string | null
  lazy?: boolean
  preferredProvider?: string
}) {
  const def = buildEmbed(sourceProvider, providerRefs, sourceUrl, preferredProvider)
  const others = embeddableProviders(providerRefs)
  const [active, setActive] = useState<Embed>(def)
  const [playing, setPlaying] = useState(!lazy)
  // The saved-default provider (drives the marker). Picking a provider in the
  // switcher persists it as the default for future jams via a (non-httpOnly) cookie.
  const [pref, setPref] = useState<string | null>(preferredProvider ?? null)
  const markedKey = resolvePreferredKey(pref, providerRefs)

  function choose(p: string) {
    setActive(buildEmbed(p, providerRefs, sourceUrl))
    const logical = parseProvider(p)
    if (logical) {
      setPref(logical)
      document.cookie = playbackCookieString(logical, location.protocol === 'https:')
    }
  }

  if (def.kind === 'link') {
    return (
      <a href={def.href} target="_blank" rel="noreferrer" className="accent-grid flex aspect-square w-full items-center justify-center text-on-accent">
        open in {def.provider} ↗
      </a>
    )
  }

  if (!playing) {
    return (
      <button type="button" onClick={() => setPlaying(true)} className="relative block w-full" aria-label="play">
        {artworkUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={artworkUrl} alt="" className="aspect-square w-full object-cover" />
        ) : (
          <span className="accent-grid block aspect-square w-full" />
        )}
        <span className="absolute inset-0 flex items-center justify-center">
          <span className="rounded border-2 border-white px-3 py-1 text-white">▶</span>
        </span>
      </button>
    )
  }

  return (
    <div>
      {others.length > 1 && (
        <div className="flex items-center gap-2 px-3 pt-3 text-xs">
          {others.map((p) => {
            const on = active.provider === p
            const isDefault = p === markedKey
            return (
              <button
                key={p}
                type="button"
                aria-pressed={on}
                title={isDefault ? 'your default — click another to change' : 'play here and make it your default'}
                onClick={() => choose(p)}
                className={`rounded border px-2 py-0.5 ${on ? 'border-ink' : 'border-border text-muted'}`}
              >
                {p}
                {isDefault && <span aria-hidden className="ml-1 text-accent">•</span>}
              </button>
            )
          })}
          <span
            className="ml-auto cursor-help select-none text-muted"
            aria-label="Embeds play full tracks only when you're signed into that service in this browser."
            title="Embeds play full tracks only when you're signed into that service in this browser."
          >
            ⓘ
          </span>
        </div>
      )}
      <iframe
        key={active.provider}
        src={active.kind === 'iframe' ? active.src : undefined}
        title={active.kind === 'iframe' ? active.title : 'player'}
        className="aspect-square w-full"
        allow="autoplay; encrypted-media; clipboard-write; fullscreen"
      />
    </div>
  )
}
