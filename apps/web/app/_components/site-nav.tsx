import Link from 'next/link'

import { getUnreadNotificationCount } from '@onrepeat/appview'

import { bsky } from '@/lib/appview'
import { buttonClassName } from '@/lib/button-variants'
import { db } from '@/lib/db'
import { getSession } from '@/lib/session'

import { PostNavLink } from './post-nav-link'
import { UserMenu } from './user-menu'

export async function SiteNav() {
  const session = await getSession()

  // Resolve the logged-in user's profile so the header links to the nicer
  // handle-based URL and shows their avatar. The /profile route also accepts a
  // DID, so fall back to it if the (cached) bsky lookup is unavailable — a
  // profile hiccup must never break the header.
  let profileActor = session.did ?? ''
  let profileAvatar: string | undefined
  if (session.did) {
    try {
      const profile = await bsky.getProfile(session.did)
      if (profile) {
        profileActor = profile.handle
        profileAvatar = profile.avatar
      }
    } catch {
      // keep the DID fallback
    }
  }

  // Unread notifications for the bell badge — like the profile lookup above, a
  // hiccup here must never break the header.
  let unread = 0
  if (session.did) {
    try {
      unread = await getUnreadNotificationCount(db, session.did)
    } catch {
      // badge stays at 0
    }
  }

  return (
    <header className="border-b border-ink/10">
      <nav className="mx-auto flex max-w-2xl items-center justify-between px-4 py-3 text-sm">
        <Link href="/" className="text-base font-bold">
          onrepeat<span className="text-accent">.fm</span>
        </Link>
        <div className="flex items-center gap-3">
          {session.did ? (
            <>
              <PostNavLink />
              <UserMenu
                did={session.did}
                avatar={profileAvatar}
                profileActor={profileActor}
                unread={unread}
              />
            </>
          ) : (
            <Link
              href="/login"
              className={buttonClassName({ variant: 'outline', size: 'md' })}
            >
              sign in
            </Link>
          )}
        </div>
      </nav>
    </header>
  )
}
