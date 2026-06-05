import Link from 'next/link'
import type { HydratedJamView } from '@onrepeat/appview'
import { Avatar, authorName } from './avatar'
import { RelativeTime } from './relative-time'
import { Player } from './player'
import { LikeButton } from './like-button'
import { ReJamButton } from './rejam-button'

function rkeyOf(uri: string): string {
  return uri.split('/').pop() ?? ''
}

/** The core feed/profile card. A shared component (renders in both the server tree
 *  via FeedList and the client tree via LoadMore); it mounts a lazy <Player> for the
 *  media area and a static action row by default. Callers may override either via the
 *  optional `player` / `actions` props (e.g. the interactive like/re-jam buttons added later). */
export function JamCard({
  jam,
  player,
  actions,
  loggedIn = false,
  preferredProvider,
}: {
  jam: HydratedJamView
  player?: React.ReactNode
  actions?: React.ReactNode
  loggedIn?: boolean
  preferredProvider?: string
}) {
  const jamHref = `/jam/${encodeURIComponent(jam.author.handle ?? jam.authorDid)}/${rkeyOf(jam.uri)}`
  const profileHref = `/profile/${encodeURIComponent(jam.author.handle ?? jam.authorDid)}`
  return (
    <article className="overflow-hidden rounded-md border border-border bg-surface">
      <div className="surface-grid flex items-center gap-2 border-b border-border px-3 py-2 text-sm">
        <Link
          href={profileHref}
          className="flex items-center gap-2 hover:text-accent"
        >
          <Avatar author={jam.author} />
          <span className="font-bold">{authorName(jam.author)}</span>
        </Link>
        <RelativeTime iso={jam.createdAt} />
        {jam.via && <span className="text-muted">· re-jam</span>}
      </div>

      {player ?? (
        <Player
          sourceProvider={jam.sourceProvider}
          providerRefs={jam.providerRefs}
          sourceUrl={jam.sourceUrl}
          artworkUrl={jam.artworkUrl}
          lazy
          preferredProvider={preferredProvider}
        />
      )}

      <div className="px-3 py-3">
        <Link href={jamHref} className="hover:text-accent">
          <div className="font-bold">{jam.title}</div>
          <div className="text-sm text-muted">{jam.artist}</div>
        </Link>
        {jam.caption && <p className="mt-2 text-sm">{jam.caption}</p>}
        <div className="mt-3 flex items-center gap-4 border-t border-border pt-2 text-sm text-muted">
          {actions ?? (
            <>
              <LikeButton
                jamUri={jam.uri}
                jamCid={jam.cid}
                initialCount={jam.likeCount}
                initialLiked={jam.likedByYou}
                loggedIn={loggedIn}
              />
              <ReJamButton
                loggedIn={loggedIn}
                jam={{
                  uri: jam.uri,
                  did: jam.authorDid,
                  sourceUrl: jam.sourceUrl,
                  sourceProvider: jam.sourceProvider,
                  title: jam.title,
                  artist: jam.artist,
                  artworkUrl: jam.artworkUrl,
                  authorName: authorName(jam.author),
                }}
              />
            </>
          )}
        </div>
      </div>
    </article>
  )
}

export { rkeyOf }
