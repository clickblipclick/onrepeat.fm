import Link from 'next/link'
import { getFollowFeed, getLatest } from '@onrepeat/appview'
import { db } from '../lib/db'
import { hydrate, bsky } from '../lib/appview'
import { getSession } from '../lib/session'
import { FeedList } from './_components/feed-list'
import { EmptyState } from './_components/empty-state'

export default async function Home() {
  const session = await getSession()

  // Logged-out: Explore + an inline sign-in form.
  if (!session.did) {
    const page = await getLatest(db, {})
    const jams = await hydrate(page.jams)
    return (
      <>
        <div className="mb-4 rounded-md border border-border bg-surface p-4">
          <p className="mb-2 text-sm">One song. Seven days. Sign in with Bluesky to follow people and set your jam.</p>
          <form action="/login" method="post" className="flex gap-2">
            <input
              name="handle"
              placeholder="you.bsky.social"
              autoCapitalize="off"
              autoCorrect="off"
              autoComplete="username"
              required
              className="flex-1 rounded border border-border bg-bg px-3 py-2 text-sm"
            />
            <button type="submit" className="rounded bg-accent px-3 py-2 text-sm text-on-accent">Sign in</button>
          </form>
        </div>
        <FeedList jams={jams} cursor={page.cursor} endpoint="/api/latest" itemsKey="feed" empty={<>No jams yet.</>} />
      </>
    )
  }

  // Logged-in: the follow feed. getFollows hits the upstream bsky graph; if that
  // (or the feed query) fails, degrade to an empty state rather than erroring the page.
  try {
    const followedDids = await bsky.getFollows(session.did)
    const page = await getFollowFeed(db, { followedDids, viewerDid: session.did })
    const jams = await hydrate(page.jams)
    return (
      <>
        <h1 className="mb-4 text-sm uppercase text-muted">Following</h1>
        {jams.length === 0 ? (
          <EmptyState>
            Nobody you follow has a current jam. <Link href="/explore" className="text-accent">Explore</Link> what&apos;s playing.
          </EmptyState>
        ) : (
          <FeedList jams={jams} cursor={page.cursor} endpoint="/api/feed" itemsKey="feed" empty={null} />
        )}
      </>
    )
  } catch {
    return (
      <>
        <h1 className="mb-4 text-sm uppercase text-muted">Following</h1>
        <EmptyState>
          Couldn&apos;t load your feed right now. <Link href="/explore" className="text-accent">Explore</Link> what&apos;s playing.
        </EmptyState>
      </>
    )
  }
}
