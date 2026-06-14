import Link from 'next/link'
import { Repeat2 } from 'lucide-react'
import type { HydratedJamView } from '@onrepeat/appview'
import { Avatar, authorName } from './avatar'
import { RelativeTime } from './relative-time'
import { LikeButton } from './like-button'
import { ReJamButton } from './rejam-button'
import { ShareButton } from './share-button'
import { JamMenu } from './jam-menu'
import { isCurrentJam } from '../../lib/format'

/** Shared jam chrome used by both the feed card (JamCard) and the jam detail page, so
 *  the two stay visually consistent instead of drifting via copy-paste. Each piece is a
 *  server component that mounts the interactive client bits (menu, like, re-jam). */

/** The accent header band: avatar + author + timestamp, with optional re-jam attribution
 *  and the owner menu. Pass `jamHref` to link the timestamp to the permalink (feed card);
 *  omit it on the detail page, where the timestamp would only link to itself. */
export function JamHeader({
  jam,
  jamHref,
  viewerDid,
  showCurrentJam = false,
  redirectTo,
}: {
  jam: HydratedJamView
  /** Permalink for the timestamp link; when omitted the timestamp renders unlinked. */
  jamHref?: string
  /** The signed-in viewer's DID; when it matches the author, the owner menu shows. */
  viewerDid?: string
  /** Show the "· current jam" marker (detail page). */
  showCurrentJam?: boolean
  /** Where the owner menu navigates after a delete (detail page → profile). */
  redirectTo?: string
}) {
  const profileHref = `/profile/${encodeURIComponent(jam.author.handle ?? jam.authorDid)}`
  const isOwner = !!viewerDid && viewerDid === jam.authorDid
  const time = (
    <RelativeTime
      iso={jam.createdAt}
      className="whitespace-nowrap text-on-accent/80"
    />
  )
  const showCurrent = showCurrentJam && isCurrentJam(jam.createdAt)
  return (
    // Avatar in its own column, identity + meta stacked beside it, so the
    // "current jam" / re-jam subline aligns under the author name (not under the
    // avatar). Row 1 keeps name + time on one line (name truncates, time stays
    // pinned); the subline never clips on a narrow card.
    <div className="flex items-start gap-2 border-b-2 border-accent bg-accent px-2 py-2 text-sm text-on-accent">
      <Link
        href={profileHref}
        aria-label={authorName(jam.author)}
        className="shrink-0 hover:opacity-90"
      >
        <Avatar author={jam.author} />
      </Link>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <Link
            href={profileHref}
            className="min-w-0 truncate font-bold hover:underline"
          >
            {authorName(jam.author)}
          </Link>
          {jamHref ? (
            <Link href={jamHref} className="shrink-0 hover:underline">
              {time}
            </Link>
          ) : (
            <span className="shrink-0">{time}</span>
          )}
          {isOwner && (
            <JamMenu
              className="ml-auto shrink-0 text-on-accent hover:bg-black/10"
              jamUri={jam.uri}
              redirectTo={redirectTo}
            />
          )}
        </div>
        {(showCurrent || (jam.via && jam.viaAuthor)) && (
          <div className="mt-0.5 flex items-center gap-1.5 text-xs text-on-accent/80">
            {showCurrent && (
              <span className="shrink-0 whitespace-nowrap">on repeat</span>
            )}
            {jam.via && jam.viaAuthor && (
              <span className="flex min-w-0 items-center gap-1">
                <Repeat2 size={13} className="shrink-0" aria-hidden />
                <span className="truncate">
                  reposted from{' '}
                  <Link
                    href={`/profile/${encodeURIComponent(jam.viaAuthor.handle ?? jam.viaAuthor.did)}`}
                    className="hover:underline"
                  >
                    {authorName(jam.viaAuthor)}
                  </Link>
                </span>
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

/** Title + artist + caption. Pass `href` to link the title/artist to the permalink
 *  (feed card); omit it on the detail page. The caller supplies the surrounding padding. */
export function JamBody({
  jam,
  href,
}: {
  jam: HydratedJamView
  href?: string
}) {
  const titleArtist = (
    <>
      <div className="font-bold">{jam.title}</div>
      <div className="text-sm text-muted">{jam.artist}</div>
    </>
  )
  return (
    <>
      {href ? (
        <Link href={href} className="hover:text-accent">
          {titleArtist}
        </Link>
      ) : (
        titleArtist
      )}
      {jam.caption && <p className="mt-2 text-sm">{jam.caption}</p>}
    </>
  )
}

/** The like + re-jam action row content; the caller supplies the bordered container. */
export function JamActions({
  jam,
  loggedIn = false,
  jamUrl,
}: {
  jam: HydratedJamView
  loggedIn?: boolean
  /** Absolute URL for the share-on-Bluesky button (detail page only); omit to hide. */
  jamUrl?: string
}) {
  return (
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
      {jamUrl && (
        <ShareButton title={jam.title} artist={jam.artist} jamUrl={jamUrl} />
      )}
    </>
  )
}
