'use client'

import { useState } from 'react'

import { CROSS_RESOLVED_PROVIDERS } from '@onrepeat/core'

import { cn } from '@/lib/cn'
import { LABELS } from '@/lib/embed'
import {
  playbackCookieString,
  VALID_PROVIDERS,
  type PlaybackProvider,
} from '@/lib/playback-preference'

/** Explicit control for the preferred playback service — the same non-httpOnly cookie
 *  the in-card "via …" switcher writes, plus the only way to clear it (Automatic).
 *  Applies on click with no server round-trip; already-rendered cards pick up the new
 *  default on their next load, same as when the switcher writes it. */
export function PlaybackPicker({
  current,
}: {
  current: PlaybackProvider | null
}) {
  const [selected, setSelected] = useState(current)

  function choose(provider: PlaybackProvider | null) {
    document.cookie = playbackCookieString(
      provider,
      location.protocol === 'https:',
    )
    setSelected(provider)
  }

  // Each card states its honest reach: only cross-resolved services can win on
  // jams from other sources; the rest only ever match jams posted from them.
  const options: {
    value: PlaybackProvider | null
    label: string
    note: string
  }[] = [
    {
      value: null,
      label: 'Automatic',
      note: 'The service each jam was posted from',
    },
    ...VALID_PROVIDERS.map((p) => {
      const label = LABELS[p] ?? p
      return {
        value: p,
        label,
        note: CROSS_RESOLVED_PROVIDERS.has(p)
          ? 'Most jams'
          : `Jams posted from ${label}`,
      }
    }),
  ]

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {options.map(({ value, label, note }) => {
        const isSelected = value === selected
        return (
          <button
            key={value ?? 'automatic'}
            type="button"
            aria-pressed={isSelected}
            onClick={() => choose(value)}
            className={cn(
              'flex flex-col gap-1 rounded-md border bg-surface p-3 text-left transition outline-none',
              'focus-visible:ring-2 focus-visible:ring-accent',
              isSelected
                ? 'border-accent ring-2 ring-accent'
                : 'border-border hover:border-accent',
            )}
          >
            <span className="text-sm font-bold text-ink">{label}</span>
            <span className="text-xs text-muted">{note}</span>
          </button>
        )
      })}
    </div>
  )
}
