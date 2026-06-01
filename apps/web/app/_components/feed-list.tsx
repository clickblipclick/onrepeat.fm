import type { HydratedJamView } from '@onrepeat/appview'
import { JamCard } from './jam-card'
import { LoadMore } from './load-more'
import { EmptyState } from './empty-state'

/** Server-rendered first page + a client LoadMore for the rest. */
export function FeedList({
  jams,
  cursor,
  endpoint,
  itemsKey,
  empty,
}: {
  jams: HydratedJamView[]
  cursor?: string
  endpoint: string
  itemsKey: 'feed' | 'jams'
  empty: React.ReactNode
}) {
  if (jams.length === 0) return <EmptyState>{empty}</EmptyState>
  return (
    <div className="flex flex-col gap-4">
      {jams.map((jam) => (
        <JamCard key={jam.uri} jam={jam} />
      ))}
      <LoadMore endpoint={endpoint} itemsKey={itemsKey} initialCursor={cursor} />
    </div>
  )
}
