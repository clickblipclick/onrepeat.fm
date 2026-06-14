import Link from 'next/link'
import { getLatest } from '@onrepeat/appview'
import { db } from '../../../lib/db'
import { hydrate } from '../../../lib/appview'
import { getSession } from '../../../lib/session'
import { readPreferredProvider } from '../../../lib/playback-preference.server'
import { linkInline } from '../../../lib/link-variants'
import { FeedList } from '../../_components/feed-list'
import { SectionLabel } from '../../_components/section-label'

export default async function ExplorePage() {
  const session = await getSession()
  const preferredProvider = (await readPreferredProvider()) ?? undefined
  const page = await getLatest(db, { viewerDid: session.did })
  const jams = await hydrate(page.jams)
  return (
    <>
      <SectionLabel as="h1" size="title" flush className="sr-only">
        Explore
      </SectionLabel>
      <FeedList
        jams={jams}
        cursor={page.cursor}
        endpoint="/api/latest"
        itemsKey="feed"
        empty={
          <>
            No jams yet.{' '}
            <Link href="/post" className={linkInline}>
              Set yours.
            </Link>
          </>
        }
        loggedIn={!!session.did}
        viewerDid={session.did}
        preferredProvider={preferredProvider}
      />
    </>
  )
}
