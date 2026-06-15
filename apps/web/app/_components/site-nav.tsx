import Link from 'next/link'
import { getSession } from '../../lib/session'
import { bsky } from '../../lib/appview'
import { buttonClassName } from '../../lib/button-variants'
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

  return (
    <header className="border-b border-ink/10">
      <nav className="mx-auto flex max-w-2xl items-center justify-between px-4 py-3 text-sm">
        <Link href="/" className="font-bold">
          onrepeat<span className="text-accent">.fm</span>
        </Link>
        <div className="flex items-center gap-3">
          {session.did ? (
            <>
              <Link
                href="/post"
                // Opening /post is intercepted into a modal over the current feed; without
                // scroll={false} Next's default scroll-to-top yanks the feed to the top as
                // the modal opens (a programmatic scroll the dialog's scroll-lock can't stop).
                scroll={false}
                className={buttonClassName({ variant: 'outline', size: 'sm' })}
              >
                <span className="sm:hidden">+ post</span>
                <span className="hidden sm:inline">+ post a song</span>
              </Link>
              <UserMenu
                did={session.did}
                avatar={profileAvatar}
                profileActor={profileActor}
              />
            </>
          ) : (
            <Link
              href="/login"
              className={buttonClassName({ variant: 'outline', size: 'sm' })}
            >
              sign in
            </Link>
          )}
        </div>
      </nav>
    </header>
  )
}
