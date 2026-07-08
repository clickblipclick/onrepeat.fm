import Link from 'next/link'

import { readModePreference } from '@/lib/mode-preference.server'

import { ModeSwitch } from './mode-switch'

export async function SiteFooter() {
  const mode = await readModePreference()
  return (
    <footer className="border-t border-ink/10">
      <div className="mx-auto flex max-w-2xl flex-wrap items-center justify-between gap-2 px-4 py-4 text-xs text-muted">
        <span>
          Site by{' '}
          <a
            href="https://heyben.com/"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-accent"
          >
            Hey, Ben!
          </a>{' '}
          ·{' '}
          <a
            href="https://github.com/clickblipclick/onrepeat.fm"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-accent"
          >
            GitHub
          </a>
        </span>
        <div className="flex items-center gap-3">
          <nav className="flex items-center gap-3">
            <Link href="/terms" className="hover:text-accent">
              Terms
            </Link>
            <Link href="/privacy" className="hover:text-accent">
              Privacy
            </Link>
          </nav>
          <ModeSwitch initial={mode ?? 'system'} />
        </div>
      </div>
    </footer>
  )
}
