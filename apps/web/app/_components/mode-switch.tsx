'use client'

import { Moon, Sun, SunMoon } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

import { cn } from '@/lib/cn'
import { applyModeClient, type DisplayMode } from '@/lib/mode-preference'

const OPTIONS = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'system', label: 'System', icon: SunMoon },
] as const

/** Inline display-mode switch in the footer (every visitor, signed in or out):
 *  a three-segment control on an inset track; the active segment sits raised on
 *  the surface color. Pins light/dark via the onrepeat_mode cookie or clears it
 *  (System); a router.refresh() re-syncs cached server payloads after each change. */
export function ModeSwitch({ initial }: { initial: DisplayMode }) {
  const router = useRouter()
  const [mode, setMode] = useState<DisplayMode>(initial)
  return (
    <div
      role="group"
      aria-label="Display mode"
      className="flex items-center gap-0.5 rounded-full border border-border bg-ink/5 p-0.5 inset-shadow-xs inset-shadow-ink/10"
    >
      {OPTIONS.map(({ value, label, icon: Icon }) => {
        const selected = value === mode
        return (
          <button
            key={value}
            type="button"
            aria-label={label}
            aria-pressed={selected}
            onClick={() => {
              setMode(value)
              applyModeClient(value)
              router.refresh()
            }}
            className={cn(
              'rounded-full p-1.5 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-accent',
              // forced-colors: bg/shadow are stripped, so give the active segment
              // a real outline there (recolored to a visible system color).
              selected
                ? 'bg-surface text-ink shadow-sm forced-colors:outline-2 forced-colors:-outline-offset-2 forced-colors:outline-solid'
                : 'text-muted hover:text-ink',
            )}
          >
            <Icon size={15} aria-hidden />
          </button>
        )
      })}
    </div>
  )
}
