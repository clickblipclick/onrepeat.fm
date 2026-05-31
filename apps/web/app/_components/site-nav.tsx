import Link from 'next/link'
import { getSession } from '../../lib/session'

export async function SiteNav() {
  const session = await getSession()
  return (
    <header className="border-b-2 border-ink bg-surface">
      <nav className="mx-auto flex max-w-2xl items-center justify-between px-4 py-3 text-sm">
        <Link href="/" className="font-bold">
          onrepeat<span className="text-accent">.fm</span>
        </Link>
        <div className="flex items-center gap-4">
          <Link href="/" className="hover:text-accent">following</Link>
          <Link href="/explore" className="hover:text-accent">explore</Link>
          {session.did ? (
            <>
              <Link href="/post" className="rounded border border-ink px-2 py-1 hover:bg-accent hover:text-on-accent hover:border-accent">
                + set your jam
              </Link>
              <Link href={`/profile/${encodeURIComponent(session.did)}`} aria-label="your profile" className="block h-6 w-6 rounded bg-accent" />
              <form action="/logout" method="post">
                <button type="submit" className="text-muted hover:text-accent">sign out</button>
              </form>
            </>
          ) : (
            <Link href="/" className="rounded border border-ink px-2 py-1 hover:bg-accent hover:text-on-accent hover:border-accent">
              sign in
            </Link>
          )}
        </div>
      </nav>
    </header>
  )
}
