import Link from 'next/link'
import { getSession } from '../../lib/session'
import { bsky } from '../../lib/appview'
import { Avatar } from './avatar'

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
    <header className="border-b-2 border-ink bg-surface">
      <nav className="mx-auto flex max-w-2xl items-center justify-between px-4 py-3 text-sm">
        <Link href="/" className="font-bold">
          onrepeat<span className="text-accent">.fm</span>
        </Link>
        <div className="flex items-center gap-4">
          <Link href="/" className="hover:text-accent">
            following
          </Link>
          <Link href="/explore" className="hover:text-accent">
            explore
          </Link>
          {session.did ? (
            <>
              <Link
                href="/post"
                className="rounded border border-ink px-2 py-1 hover:bg-accent hover:text-on-accent hover:border-accent"
              >
                + set your jam
              </Link>
              <Link
                href={`/profile/${encodeURIComponent(profileActor)}`}
                aria-label="your profile"
                className="block"
              >
                <Avatar
                  author={{ did: session.did, avatar: profileAvatar }}
                  size={24}
                />
              </Link>
              <form action="/logout" method="post">
                <button type="submit" className="text-muted hover:text-accent">
                  sign out
                </button>
              </form>
            </>
          ) : (
            <Link
              href="/login"
              className="rounded border border-ink px-2 py-1 hover:bg-accent hover:text-on-accent hover:border-accent"
            >
              sign in
            </Link>
          )}
        </div>
      </nav>
    </header>
  )
}
