'use client'

import { Moon, Sun, SunMoon } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

import { cn } from '@/lib/cn'
import { applyModeClient, type DisplayMode } from '@/lib/mode-preference'

const OPTIONS = [
  { value: 'light', label: 'Light', icon: Sun, hint: 'Always light' },
  { value: 'dark', label: 'Dark', icon: Moon, hint: 'Always dark' },
  {
    value: 'system',
    label: 'System',
    icon: SunMoon,
    hint: 'Follow your device',
  },
] as const

/** Display-mode picker: pins light/dark via the onrepeat_mode cookie, or clears it
 *  (System). Applies instantly by flipping data-mode on <html> — device-local, no
 *  server round-trip (unlike ThemePicker, which writes to the profile record).
 *  A router.refresh() re-syncs cached server payloads so back-navigation doesn't
 *  show a stale selection. */
export function ModeToggle({ initial }: { initial: DisplayMode }) {
  const router = useRouter()
  const [mode, setMode] = useState<DisplayMode>(initial)
  return (
    <div
      role="group"
      aria-label="Display mode"
      className="grid grid-cols-3 gap-3"
    >
      {OPTIONS.map(({ value, label, icon: Icon, hint }) => {
        const selected = value === mode
        return (
          <button
            key={value}
            type="button"
            aria-pressed={selected}
            onClick={() => {
              setMode(value)
              applyModeClient(value)
              router.refresh()
            }}
            className={cn(
              'flex flex-col gap-2 rounded-md border bg-surface p-3 text-left transition-colors outline-none',
              'focus-visible:ring-2 focus-visible:ring-accent',
              // forced-colors: rings (box-shadow) are stripped and all borders get the
              // same system color, so give the active card a real outline there.
              selected
                ? 'border-accent ring-2 ring-accent forced-colors:outline-2 forced-colors:-outline-offset-2 forced-colors:outline-solid'
                : 'border-border hover:border-accent',
            )}
          >
            <Icon size={20} aria-hidden />
            <span className="text-sm font-bold text-ink">{label}</span>
            <span className="text-xs text-muted">{hint}</span>
          </button>
        )
      })}
    </div>
  )
}
