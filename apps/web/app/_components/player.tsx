'use client'

import { useState } from 'react'
import type { ProviderRefs } from '@onrepeat/db'
import { buildEmbed, embeddableProviders, type Embed } from '../../lib/embed'

/** Lazy cross-platform player. In `lazy` mode (feeds) it shows the artwork until
 *  the user hits play; otherwise it mounts the default embed immediately. */
export function Player({
  sourceProvider,
  providerRefs,
  sourceUrl,
  artworkUrl,
  lazy = false,
}: {
  sourceProvider: string | null
  providerRefs: ProviderRefs
  sourceUrl: string
  artworkUrl: string | null
  lazy?: boolean
}) {
  const def = buildEmbed(sourceProvider, providerRefs, sourceUrl)
  const others = embeddableProviders(providerRefs)
  const [active, setActive] = useState<Embed>(def)
  const [playing, setPlaying] = useState(!lazy)

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
        <div className="flex gap-2 px-3 pt-3 text-xs">
          {others.map((p) => {
            const e = buildEmbed(p, providerRefs, sourceUrl)
            const on = active.provider === p
            return (
              <button
                key={p}
                type="button"
                aria-pressed={on}
                onClick={() => setActive(e)}
                className={`rounded border px-2 py-0.5 ${on ? 'border-ink' : 'border-border text-muted'}`}
              >
                {p}
              </button>
            )
          })}
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
