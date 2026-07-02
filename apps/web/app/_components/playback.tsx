'use client'

import { createContext, useContext, useMemo, useState } from 'react'

import type { ProviderRefs } from '@onrepeat/db'

import {
  buildEmbed,
  embeddableProviders,
  LABELS,
  type Embed,
} from '@/lib/embed'
import { playNowPlaying } from '@/lib/now-playing-store'
import { parseProvider, playbackCookieString } from '@/lib/playback-preference'

import { Menu } from './ui/menu'
import { useIsDesktop } from './use-is-desktop'
import { useNowPlaying } from './use-now-playing'

interface PlaybackState {
  /** This jam's AT URI — the card's play control tags itself with it (`data-play-jam`)
   *  so the corner host can return focus to it on close. */
  jamUri: string
  /** The embed the player would/does show (resolved: preferred → source → first ref). */
  active: Embed
  /** Embeddable platform keys offered for this jam (the switcher's menu items). */
  platforms: string[]
  /** Mobile only: the in-card embed is open. (Desktop playback lives in the corner host.) */
  playing: boolean
  /** Desktop only: this jam is the one playing in the corner. */
  isNowPlaying: boolean
  /** True at desktop widths (play routes to the corner host). */
  isDesktop: boolean
  /** Start playing the currently-resolved service (never touches the stored preference).
   *  `viaKeyboard` marks keyboard activation so the corner host knows to take focus. */
  play: (viaKeyboard?: boolean) => void
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
  jamUri,
  sourceProvider,
  providerRefs,
  sourceUrl,
  preferredProvider,
  title,
  artist,
  artworkUrl,
  theme,
  lazy = true,
  children,
}: {
  jamUri: string
  sourceProvider: string | null
  providerRefs: ProviderRefs
  sourceUrl: string
  preferredProvider?: string
  title: string
  artist: string
  artworkUrl: string | null
  theme?: string
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

  const isDesktop = useIsDesktop()
  const nowPlaying = useNowPlaying()
  const isNowPlaying = nowPlaying?.jamUri === jamUri

  /** Desktop → set the corner host; mobile → open the in-card embed. */
  function start(embed: Embed, viaKeyboard?: boolean) {
    if (isDesktop) {
      playNowPlaying({
        jamUri,
        embed,
        title,
        artist,
        artworkUrl,
        theme,
        focusCorner: viaKeyboard,
      })
    } else {
      setActive(embed)
      setPlaying(true)
    }
  }

  function launch(p: string) {
    const embed = buildEmbed(p, providerRefs, sourceUrl)
    const logical = parseProvider(p)
    if (logical) {
      document.cookie = playbackCookieString(
        logical,
        location.protocol === 'https:',
      )
    }
    setActive(embed) // keep the switcher label in sync on both platforms
    start(embed)
  }

  const value = useMemo<PlaybackState>(
    () => ({
      jamUri,
      active,
      platforms,
      playing,
      isNowPlaying,
      isDesktop,
      play: (viaKeyboard?: boolean) => start(active, viaKeyboard),
      close: () => setPlaying(false),
      launch,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      active,
      playing,
      isNowPlaying,
      isDesktop,
      jamUri,
      title,
      artist,
      artworkUrl,
      theme,
      sourceProvider,
      providerRefs,
      sourceUrl,
    ],
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
  // Both variants present their text baseline as the flex-item baseline (no inner
  // vertical centering), so the title row's items-baseline lines them up with the
  // track title exactly. The trigger keeps a ~32px touch target via py-2 instead
  // of min-h, since a centered min-height box would float off the shared baseline.
  if (platforms.length < 2) {
    return (
      <span className="shrink-0 px-1.5 text-xs text-muted">
        via {activeLabel}
      </span>
    )
  }
  return (
    <Menu
      label={`via ${activeLabel} — change playback service`}
      triggerClassName="inline-flex shrink-0 cursor-pointer items-baseline gap-1 rounded px-1.5 py-2 text-xs text-muted transition hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
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
