import Link from 'next/link'
import type { HydratedJamView } from '@onrepeat/appview'
import { Avatar, authorName } from './avatar'
import { RelativeTime } from './relative-time'
import { Player } from './player'
import { LikeButton } from './like-button'
import { ReJamButton } from './rejam-button'
import { JamMenu } from './jam-menu'
import { cardPattern } from '../../lib/card-pattern'

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
  viewerDid,
  priority = false,
  preferredProvider,
}: {
  jam: HydratedJamView
  player?: React.ReactNode
  actions?: React.ReactNode
  loggedIn?: boolean
  /** The signed-in viewer's DID; when it matches the author, the owner menu shows. */
  viewerDid?: string
  /** Mark this card's cover as the LCP image (e.g. the first card in a feed). */
  priority?: boolean
  preferredProvider?: string
}) {
  const jamHref = `/jam/${encodeURIComponent(jam.author.handle ?? jam.authorDid)}/${rkeyOf(jam.uri)}`
  const profileHref = `/profile/${encodeURIComponent(jam.author.handle ?? jam.authorDid)}`
  const isOwner = !!viewerDid && viewerDid === jam.authorDid
  const pattern = cardPattern(jam.authorDid)
  return (
    // Scope the card to its author's theme — the CSS-variable cascade (globals.css)
    // re-colors everything inside. The thick ink border + offset accent shadow + framed
    // artwork give the card weight and make the author's theme pop (riso-print feel).
    <article
      data-theme={jam.author.theme}
      className={`${pattern} overflow-hidden rounded-md border-2 border-accent bg-surface shadow-[4px_4px_0_0_var(--accent)] transition-shadow hover:shadow-[6px_6px_0_0_var(--accent)]`}
    >
      <div className="flex items-center gap-2 border-b-2 border-accent bg-accent px-2 py-2 text-sm text-on-accent">
        <Link
          href={profileHref}
          className="flex items-center gap-2 hover:underline"
        >
          <Avatar author={jam.author} />
          <span className="font-bold">{authorName(jam.author)}</span>
        </Link>
        <RelativeTime iso={jam.createdAt} className="text-on-accent/80" />
        {jam.via && jam.viaAuthor && (
          <span className="truncate text-on-accent/80">
            · re-jam from{' '}
            <Link
              href={`/profile/${encodeURIComponent(jam.viaAuthor.handle ?? jam.viaAuthor.did)}`}
              className="hover:underline"
            >
              {authorName(jam.viaAuthor)}
            </Link>
          </span>
        )}
        {isOwner && (
          <JamMenu
            className="ml-auto text-on-accent hover:bg-black/10"
            jamUri={jam.uri}
          />
        )}
      </div>

      {/* Artwork sits inset on the themed surface with a crisp frame, so it reads as a
          framed object rather than a flush block. */}
      <div className="p-4">
        <div className="overflow-hidden rounded">
          {player ?? (
            <Player
              sourceProvider={jam.sourceProvider}
              providerRefs={jam.providerRefs}
              sourceUrl={jam.sourceUrl}
              artworkUrl={jam.artworkUrl}
              lazy
              priority={priority}
              preferredProvider={preferredProvider}
            />
          )}
        </div>
      </div>

      <div className="px-4 pb-4">
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
