'use client'

import { Bell, LogOut, Settings, User } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useRef } from 'react'

import { Avatar } from './avatar'
import { Menu } from './ui/menu'

/** Account menu on the nav avatar (shared <Menu>): notifications, your profile,
 *  settings, sign out. Unread notifications show as an accent dot on the avatar and
 *  a highlighted first item with a count pill — the nav itself stays two controls.
 *  Sign out submits a hidden form so the logout route's session-clearing POST runs natively. */
export function UserMenu({
  did,
  avatar,
  profileActor,
  unread = 0,
}: {
  did: string
  avatar?: string
  profileActor: string
  unread?: number
}) {
  const router = useRouter()
  const signOutRef = useRef<HTMLFormElement>(null)
  return (
    <>
      <Menu
        label={
          unread > 0
            ? `Account menu (${unread} new notifications)`
            : 'Account menu'
        }
        triggerClassName="relative block rounded outline-none focus-visible:ring-2 focus-visible:ring-accent"
        items={[
          {
            label: 'Notifications',
            icon: <Bell size={16} aria-hidden />,
            accent: unread > 0,
            badge:
              unread > 0 ? (unread > 99 ? '99+' : String(unread)) : undefined,
            dividerAfter: true,
            onSelect: () => router.push('/notifications'),
          },
          {
            label: 'Your profile',
            icon: <User size={16} aria-hidden />,
            onSelect: () =>
              router.push(`/profile/${encodeURIComponent(profileActor)}`),
          },
          {
            label: 'Settings',
            icon: <Settings size={16} aria-hidden />,
            onSelect: () => router.push('/settings'),
          },
          {
            label: 'Sign out',
            icon: <LogOut size={16} aria-hidden />,
            onSelect: () => signOutRef.current?.submit(),
          },
        ]}
      >
        <Avatar author={{ did, avatar }} size={34} />
        {unread > 0 && (
          <span
            aria-hidden
            className="absolute -top-1 -right-1 size-2.5 rounded-full border-2 border-bg bg-accent"
          />
        )}
      </Menu>
      {/* Native POST to the logout route (clears the session cookie, 303 → home). */}
      <form
        ref={signOutRef}
        action="/logout"
        method="post"
        className="hidden"
      />
    </>
  )
}
