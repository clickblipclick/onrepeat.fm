'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '../../lib/cn'

/** Segmented control that switches between the two feeds. Lives at the top of the
 *  feeds route group (see (feeds)/layout.tsx), replacing the old header nav links.
 *  Full-width tabs on mobile (thumb-friendly); auto-width inline on desktop. */
const TABS = [
  { href: '/', label: 'Following' },
  { href: '/explore', label: 'Explore' },
] as const

export function FeedTabs() {
  const pathname = usePathname()
  return (
    <nav aria-label="Feeds" className="mb-4 flex gap-1 border-b border-border">
      {TABS.map((tab) => {
        const active = pathname === tab.href
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'flex-1 border-b-2 px-3 py-2 text-center text-sm font-bold sm:flex-none',
              active
                ? 'border-accent text-ink'
                : 'border-transparent text-muted hover:text-ink',
            )}
          >
            {tab.label}
          </Link>
        )
      })}
    </nav>
  )
}
