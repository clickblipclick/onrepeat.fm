import Link from 'next/link'

import { getFollowFeed, getFollowingDids, getLatest } from '@onrepeat/appview'

import { EmptyState } from '@/app/_components/empty-state'
import { FeedList } from '@/app/_components/feed-list'
import { SectionLabel } from '@/app/_components/section-label'
import { hydrate } from '@/lib/appview'
import { buttonClassName } from '@/lib/button-variants'
import { db } from '@/lib/db'
import { linkInline } from '@/lib/link-variants'
import { readPreferredProvider } from '@/lib/playback-preference.server'
import { getSession } from '@/lib/session'

export default async function Home() {
  const session = await getSession()
  const preferredProvider = (await readPreferredProvider()) ?? undefined

  // Logged-out: Explore + an inline sign-in form.
  if (!session.did) {
    const page = await getLatest(db, {})
    const jams = await hydrate(page.jams)
    return (
      <>
        <SectionLabel as="h1" size="title" flush className="sr-only">
          Explore
        </SectionLabel>
        <div className="mb-4 rounded-md border border-border bg-surface p-4">
          <p className="mb-2 text-sm">
            The song you&apos;ve got on repeat. Sign in with Bluesky to follow
            people and post a song.
          </p>
          <Link href="/login" className={buttonClassName()}>
            Sign in
          </Link>
        </div>
        <FeedList
          jams={jams}
          cursor={page.cursor}
          endpoint="/api/latest"
          itemsKey="feed"
          empty={<>Nothing on repeat yet.</>}
          loggedIn={false}
          preferredProvider={preferredProvider}
        />
      </>
    )
  }

  // Logged-in: the follow feed reads our native graph (the follows table), not bsky's.
  try {
    const followedDids = await getFollowingDids(db, session.did)
    const page = await getFollowFeed(db, {
      followedDids,
      viewerDid: session.did,
    })
    const jams = await hydrate(page.jams)
    return (
      <>
        <SectionLabel as="h1" size="title" flush className="sr-only">
          Following
        </SectionLabel>
        {jams.length === 0 ? (
          <EmptyState>
            Nobody you follow has a song on repeat.{' '}
            <Link href="/explore" className={linkInline}>
              Explore
            </Link>{' '}
            what&apos;s playing.
          </EmptyState>
        ) : (
          <FeedList
            jams={jams}
            cursor={page.cursor}
            endpoint="/api/feed"
            itemsKey="feed"
            empty={null}
            loggedIn={true}
            viewerDid={session.did}
            preferredProvider={preferredProvider}
          />
        )}
      </>
    )
  } catch {
    return (
      <>
        <SectionLabel as="h1" size="title" flush className="sr-only">
          Following
        </SectionLabel>
        <EmptyState>
          Couldn&apos;t load your feed right now.{' '}
          <Link href="/explore" className={linkInline}>
            Explore
          </Link>{' '}
          what&apos;s playing.
        </EmptyState>
      </>
    )
  }
}
