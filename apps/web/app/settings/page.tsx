import { redirect } from 'next/navigation'

import { SectionLabel } from '@/app/_components/section-label'
import { readModePreference } from '@/lib/mode-preference.server'
import { getSession } from '@/lib/session'
import { readViewerTheme } from '@/lib/viewer-theme'

import { ModeToggle } from './mode-toggle'
import { ThemePicker } from './theme-picker'

export const metadata = {
  title: 'Settings · onrepeat.fm',
}

export default async function SettingsPage() {
  const { did } = await getSession()
  if (!did) redirect('/login')

  // The signed-in user's current theme (their deterministic default until they pick one).
  const current = await readViewerTheme()
  const mode = await readModePreference()

  return (
    <>
      <SectionLabel as="h1" size="title">
        Settings
      </SectionLabel>
      <section>
        <h2 className="font-bold">Profile theme</h2>
        <p className="mt-1 mb-3 text-sm text-muted">
          The colors for your profile and your posts in other people&apos;s
          feeds. Light and dark follow your display mode.
        </p>
        <ThemePicker current={current} />
      </section>
      <section className="mt-8">
        <h2 className="font-bold">Display mode</h2>
        <p className="mt-1 mb-3 text-sm text-muted">
          Pin light or dark, or follow your device. Saved on this device only.
        </p>
        <ModeToggle initial={mode ?? 'system'} />
      </section>
    </>
  )
}
