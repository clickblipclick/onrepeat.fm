'use client'

import { Moon, Sun, SunMoon } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

import { applyModeClient, type DisplayMode } from '@/lib/mode-preference'

import { Menu } from './ui/menu'

const ICONS = { light: Sun, dark: Moon, system: SunMoon } as const

/** Display-mode picker in the nav for signed-out visitors (signed-in users have
 *  the same control in Settings). Radio-style items via <Menu>'s `selected`; a
 *  router.refresh() re-syncs cached server payloads after each change. */
export function ModeMenu({ initial }: { initial: DisplayMode }) {
  const router = useRouter()
  const [mode, setMode] = useState<DisplayMode>(initial)
  const TriggerIcon = ICONS[mode]
  const select = (value: DisplayMode) => () => {
    setMode(value)
    applyModeClient(value)
    router.refresh()
  }
  return (
    <Menu
      label="Display mode"
      triggerClassName="rounded p-1.5 text-muted outline-none hover:text-ink focus-visible:ring-2 focus-visible:ring-accent"
      items={[
        {
          label: 'Light',
          icon: <Sun size={16} aria-hidden />,
          onSelect: select('light'),
          selected: mode === 'light',
        },
        {
          label: 'Dark',
          icon: <Moon size={16} aria-hidden />,
          onSelect: select('dark'),
          selected: mode === 'dark',
        },
        {
          label: 'System',
          icon: <SunMoon size={16} aria-hidden />,
          onSelect: select('system'),
          selected: mode === 'system',
        },
      ]}
    >
      <TriggerIcon size={18} aria-hidden />
    </Menu>
  )
}
