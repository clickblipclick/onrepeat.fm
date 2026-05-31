import Link from 'next/link'
import type { HydratedJamView } from '@onrepeat/appview'
import { Avatar, authorName } from './avatar'
import { RelativeTime } from './relative-time'

function rkeyOf(uri: string): string {
  return uri.split('/').pop() ?? ''
}

/** The core feed/profile unit. `player` and `actions` are injected by callers
 *  (client islands) so this component itself stays server-rendered. */
export function JamCard({
  jam,
  player,
  actions,
}: {
  jam: HydratedJamView
  player?: React.ReactNode
  actions?: React.ReactNode
}) {
  const jamHref = `/jam/${encodeURIComponent(jam.authorDid)}/${rkeyOf(jam.uri)}`
  const profileHref = `/profile/${encodeURIComponent(jam.author.handle ?? jam.authorDid)}`
  return (
    <article className="overflow-hidden rounded-md border border-border bg-surface">
      <div className="surface-grid flex items-center gap-2 border-b border-border px-3 py-2 text-sm">
        <Link href={profileHref} className="flex items-center gap-2 hover:text-accent">
          <Avatar author={jam.author} />
          <span className="font-bold">{authorName(jam.author)}</span>
        </Link>
        <RelativeTime iso={jam.createdAt} />
        {jam.via && <span className="text-muted">· re-jam</span>}
      </div>

      {player ?? (
        <Link href={jamHref} className="block">
          {jam.artworkUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={jam.artworkUrl} alt={`${jam.title} by ${jam.artist}`} className="aspect-square w-full object-cover" />
          ) : (
            <div className="accent-grid flex aspect-square w-full items-center justify-center text-on-accent">▶</div>
          )}
        </Link>
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
              <span className={jam.likedByYou ? 'text-accent' : undefined}>♥ {jam.likeCount}</span>
              <Link href={jamHref} className="hover:text-accent">re-jam</Link>
            </>
          )}
        </div>
      </div>
    </article>
  )
}

export { rkeyOf }
