'use client'

import { createContext, useContext, useMemo, useState } from 'react'
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
import { Menu } from './ui/menu'

interface PlaybackState {
  /** The embed the player would/does show (resolved: preferred → source → first ref). */
  active: Embed
  /** Embeddable platform keys offered for this jam (the switcher's menu items). */
  platforms: string[]
  playing: boolean
  /** Start playing the currently-resolved service (never touches the stored preference). */
  play: () => void
  close: () => void
  /** Switch to a platform and play it; persists it as the preferred service. */
  launch: (p: string) => void
}

const PlaybackContext = createContext<PlaybackState | null>(null)

export function usePlayback(): PlaybackState {
  const ctx = useContext(PlaybackContext)
  if (!ctx)
    throw new Error('usePlayback must be used inside <PlaybackProvider>')
  return ctx
}

/** Owns one jam's playback state (which service, playing or not) so the player (in the
 *  media frame) and the service switcher (beside the title/artist) stay in sync without
 *  living in the same component. Wraps the card's media + body regions. */
export function PlaybackProvider({
  sourceProvider,
  providerRefs,
  sourceUrl,
  preferredProvider,
  lazy = true,
  children,
}: {
  sourceProvider: string | null
  providerRefs: ProviderRefs
  sourceUrl: string
  preferredProvider?: string
  lazy?: boolean
  children: React.ReactNode
}) {
  const def = buildEmbed(
    sourceProvider,
    providerRefs,
    sourceUrl,
    preferredProvider,
  )
  const others = embeddableProviders(providerRefs)
  // Platforms offered in the switcher — the resolved embeddable refs, or the source
  // itself when nothing's resolved yet (def is always an iframe past the link guard).
  const platforms = others.length > 0 ? others : [def.provider]
  const [active, setActive] = useState<Embed>(def)
  const [playing, setPlaying] = useState(!lazy)

  function launch(p: string) {
    setActive(buildEmbed(p, providerRefs, sourceUrl))
    const logical = parseProvider(p)
    if (logical) {
      // Persist the picked service as the default for future jams (read on next load).
      document.cookie = playbackCookieString(
        logical,
        location.protocol === 'https:',
      )
    }
    setPlaying(true)
  }

  const value = useMemo<PlaybackState>(
    () => ({
      active,
      platforms,
      playing,
      play: () => setPlaying(true),
      close: () => setPlaying(false),
      launch,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [active, playing, sourceProvider, providerRefs, sourceUrl],
  )

  return (
    <PlaybackContext.Provider value={value}>
      {children}
    </PlaybackContext.Provider>
  )
}

/** The "via {Service} ▾" switcher: opens a radio menu of this jam's embeddable platforms;
 *  picking one plays it (swapping the live embed mid-play) and persists the preference.
 *  With a single embeddable platform it degrades to a static "via {Service}" label, so
 *  every card still says where playback happens. Renders nothing for link-out jams
 *  (their artwork already reads "open in {provider} ↗"). */
export function PlaybackSwitcher() {
  const { active, platforms, launch } = usePlayback()
  if (active.kind === 'link') return null
  const activeLabel = LABELS[active.provider] ?? active.provider
  if (platforms.length < 2) {
    return (
      <span className="flex min-h-8 shrink-0 items-center px-1.5 text-xs text-muted">
        via {activeLabel}
      </span>
    )
  }
  return (
    <Menu
      label={`via ${activeLabel} — change playback service`}
      triggerClassName="flex min-h-8 shrink-0 cursor-pointer items-center gap-1 rounded px-1.5 text-xs text-muted transition hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
      items={platforms.map((p) => ({
        label: LABELS[p] ?? p,
        selected: p === active.provider,
        onSelect: () => launch(p),
      }))}
    >
      via {activeLabel} <span aria-hidden>▾</span>
    </Menu>
  )
}
