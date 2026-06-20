'use client'

import { LogOut, Settings, User } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useRef } from 'react'

import { Avatar } from './avatar'
import { Menu } from './ui/menu'

/** Account menu on the nav avatar (shared <Menu>): jump to your profile, or sign out.
 *  Sign out submits a hidden form so the logout route's session-clearing POST runs natively. */
export function UserMenu({
  did,
  avatar,
  profileActor,
}: {
  did: string
  avatar?: string
  profileActor: string
}) {
  const router = useRouter()
  const signOutRef = useRef<HTMLFormElement>(null)
  return (
    <>
      <Menu
        label="Account menu"
        triggerClassName="block rounded outline-none focus-visible:ring-2 focus-visible:ring-accent"
        items={[
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
        <Avatar author={{ did, avatar }} size={24} />
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
