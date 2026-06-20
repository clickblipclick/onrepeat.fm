import type { HydratedJamView } from '@onrepeat/appview'

import { EmptyState } from './empty-state'
import { JamCard } from './jam-card'
import { LoadMore } from './load-more'

/** Server-rendered first page + a client LoadMore for the rest. */
export function FeedList({
  jams,
  cursor,
  endpoint,
  itemsKey,
  empty,
  loggedIn,
  viewerDid,
  preferredProvider,
}: {
  jams: HydratedJamView[]
  cursor?: string
  endpoint: string
  itemsKey: 'feed' | 'jams'
  empty: React.ReactNode
  loggedIn: boolean
  viewerDid?: string
  preferredProvider?: string
}) {
  if (jams.length === 0) return <EmptyState>{empty}</EmptyState>
  return (
    <div className="flex flex-col gap-8">
      {jams.map((jam, i) => (
        <JamCard
          key={jam.uri}
          jam={jam}
          loggedIn={loggedIn}
          viewerDid={viewerDid}
          priority={i === 0} // first card's cover is the LCP candidate
          preferredProvider={preferredProvider}
        />
      ))}
      <LoadMore
        endpoint={endpoint}
        itemsKey={itemsKey}
        initialCursor={cursor}
        loggedIn={loggedIn}
        viewerDid={viewerDid}
      />
    </div>
  )
}
