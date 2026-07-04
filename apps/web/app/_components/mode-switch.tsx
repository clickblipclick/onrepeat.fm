'use client'

import { Moon, Sun, SunMoon } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

import { applyModeClient, type DisplayMode } from '@/lib/mode-preference'

import { SegmentedControl, type SegmentedOption } from './ui/segmented'

const OPTIONS: readonly SegmentedOption<DisplayMode>[] = [
  { value: 'light', label: 'Light', icon: <Sun size={15} aria-hidden /> },
  { value: 'dark', label: 'Dark', icon: <Moon size={15} aria-hidden /> },
  { value: 'system', label: 'System', icon: <SunMoon size={15} aria-hidden /> },
]

/** Display-mode switch in the footer (every visitor, signed in or out). Pins
 *  light/dark via the onrepeat_mode cookie or clears it (System); a
 *  router.refresh() re-syncs cached server payloads after each change. */
export function ModeSwitch({ initial }: { initial: DisplayMode }) {
  const router = useRouter()
  const [mode, setMode] = useState<DisplayMode>(initial)
  return (
    <SegmentedControl
      label="Display mode"
      options={OPTIONS}
      value={mode}
      onChange={(value) => {
        setMode(value)
        applyModeClient(value)
        router.refresh()
      }}
    />
  )
}
