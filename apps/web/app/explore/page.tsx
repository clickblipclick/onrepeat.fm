import Link from 'next/link'
import { getLatest } from '@onrepeat/appview'
import { db } from '../../lib/db'
import { hydrate } from '../../lib/appview'
import { getSession } from '../../lib/session'
import { readPreferredProvider } from '../../lib/playback-preference.server'
import { FeedList } from '../_components/feed-list'

export default async function ExplorePage() {
  const session = await getSession()
  const preferredProvider = (await readPreferredProvider()) ?? undefined
  const page = await getLatest(db, { viewerDid: session.did })
  const jams = await hydrate(page.jams)
  return (
    <>
      <h1 className="mb-4 text-sm uppercase text-muted">Latest jams</h1>
      <FeedList
        jams={jams}
        cursor={page.cursor}
        endpoint="/api/latest"
        itemsKey="feed"
        empty={
          <>
            No jams yet.{' '}
            <Link href="/post" className="text-accent">
              Set yours.
            </Link>
          </>
        }
        loggedIn={!!session.did}
        preferredProvider={preferredProvider}
      />
    </>
  )
}
