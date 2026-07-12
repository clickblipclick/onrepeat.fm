'use client'

import { useState } from 'react'

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

  const options: { value: PlaybackProvider | null; label: string }[] = [
    { value: null, label: 'Automatic' },
    ...VALID_PROVIDERS.map((p) => ({ value: p, label: LABELS[p] ?? p })),
  ]

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {options.map(({ value, label }) => {
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
            <span className="text-xs text-muted">
              {/* nbsp: a plain space collapses to a 0-height line, shrinking unselected cards */}
              {isSelected ? 'current' : ' '}
            </span>
          </button>
        )
      })}
    </div>
  )
}
