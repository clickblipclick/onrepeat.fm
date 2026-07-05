'use client'

import Link, { useLinkStatus } from 'next/link'
import { usePathname } from 'next/navigation'

import { cn } from '@/lib/cn'

/** Segmented control that switches between the two feeds. Lives at the top of the
 *  feeds route group (see (feeds)/layout.tsx), replacing the old header nav links.
 *  Full-width tabs on mobile (thumb-friendly); auto-width inline on desktop. */
const TABS = [
  { href: '/', label: 'Following' },
  { href: '/explore', label: 'Explore' },
] as const

/** Dims the tab label while its navigation is in flight (the feeds render dynamically,
 *  so a switch waits on the server). The animation's start delay keeps fast switches
 *  indicator-free — only a slow fetch ever shows it. */
function TabLabel({ children }: { children: React.ReactNode }) {
  const { pending } = useLinkStatus()
  return <span className={cn(pending && 'tab-pending')}>{children}</span>
}

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
            <TabLabel>{tab.label}</TabLabel>
          </Link>
        )
      })}
    </nav>
  )
}
