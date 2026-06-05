import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getJam } from '@onrepeat/appview'
import { db } from '../../../../lib/db'
import { hydrate, bsky } from '../../../../lib/appview'
import { getSession } from '../../../../lib/session'
import { readPreferredProvider } from '../../../../lib/playback-preference.server'
import { Player } from '../../../_components/player'
import { Avatar, authorName } from '../../../_components/avatar'
import { RelativeTime } from '../../../_components/relative-time'
import { isCurrentJam } from '../../../../lib/format'
import { LikeButton } from '../../../_components/like-button'
import { ReJamButton } from '../../../_components/rejam-button'

// Inlined (canonical source: JAM_NSID in @onrepeat/lexicons) to avoid adding that
// workspace dep for a single constant. Consolidate if apps/web needs more lexicon values.
const JAM_NSID = 'fm.onrepeat.jam'

export default async function JamPage({
  params,
}: {
  params: Promise<{ actor: string; rkey: string }>
}) {
  const { actor, rkey } = await params
  // `actor` is a handle (pretty links) or a DID (older/shared links). Records are keyed
  // by DID, so resolve a handle to its DID before building the at-uri.
  const actorDecoded = decodeURIComponent(actor)
  let authorDid = actorDecoded
  if (!actorDecoded.startsWith('did:')) {
    const prof = await bsky.getProfile(actorDecoded)
    if (!prof) notFound()
    authorDid = prof.did
  }
  const uri = `at://${authorDid}/${JAM_NSID}/${decodeURIComponent(rkey)}`
  const session = await getSession()
  const preferredProvider = (await readPreferredProvider()) ?? undefined
  const detail = await getJam(db, { uri, viewerDid: session.did })
  if (!detail) notFound()

  const hydrated = await hydrate([detail.jam])
  const jam = hydrated[0]
  if (!jam) notFound()
  const reJams = await hydrate(detail.reJams)
  // Liker avatars are enrichment: degrade to DID-only on a bsky outage rather than erroring the page.
  let likerProfiles: Awaited<ReturnType<typeof bsky.getProfiles>> = new Map()
  try {
    likerProfiles = await bsky.getProfiles(detail.likerDids)
  } catch {
    // leave likerProfiles empty → DID-only avatars
  }
  const profileHref = `/profile/${encodeURIComponent(jam.author.handle ?? jam.authorDid)}`

  return (
    <article className="rounded-md border border-border bg-surface p-4">
      <div className="flex items-center gap-2 text-sm">
        <Link
          href={profileHref}
          className="flex items-center gap-2 hover:text-accent"
        >
          <Avatar author={jam.author} />
          <span className="font-bold">{authorName(jam.author)}</span>
        </Link>
        <RelativeTime iso={jam.createdAt} />
        {isCurrentJam(jam.createdAt) && (
          <span className="text-muted">· current jam</span>
        )}
      </div>

      <div className="mt-3 overflow-hidden rounded">
        <Player
          sourceProvider={jam.sourceProvider}
          providerRefs={jam.providerRefs}
          sourceUrl={jam.sourceUrl}
          artworkUrl={jam.artworkUrl}
          preferredProvider={preferredProvider}
        />
      </div>

      <div className="mt-3">
        <div className="font-bold">{jam.title}</div>
        <div className="text-sm text-muted">{jam.artist}</div>
        {jam.caption && <p className="mt-2 text-sm">{jam.caption}</p>}
      </div>

      <div className="mt-3 flex items-center gap-4 border-t border-border pt-3 text-sm text-muted">
        <LikeButton
          jamUri={jam.uri}
          jamCid={jam.cid}
          initialCount={jam.likeCount}
          initialLiked={jam.likedByYou}
          loggedIn={!!session.did}
        />
        <ReJamButton
          loggedIn={!!session.did}
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
      </div>

      {detail.likerDids.length > 0 && (
        <div className="mt-4">
          <div className="text-xs uppercase text-muted">Liked by</div>
          <div className="mt-1 flex flex-wrap gap-1">
            {detail.likerDids.slice(0, 12).map((d) => {
              const p = likerProfiles.get(d)
              return <Avatar key={d} author={p ?? { did: d }} size={22} />
            })}
            {detail.likerDids.length > 12 && (
              <span className="self-center text-xs text-muted">
                +{detail.likerDids.length - 12}
              </span>
            )}
          </div>
        </div>
      )}

      {reJams.length > 0 && (
        <div className="mt-4">
          <div className="text-xs uppercase text-muted">
            Re-jams ({reJams.length})
          </div>
          <div className="mt-1 flex flex-col gap-1.5">
            {reJams.map((rj) => (
              <Link
                key={rj.uri}
                href={`/profile/${encodeURIComponent(rj.author.handle ?? rj.authorDid)}`}
                className="rounded border border-border px-2 py-1.5 text-sm hover:text-accent"
              >
                <b>{authorName(rj.author)}</b> re-jammed ·{' '}
                <RelativeTime iso={rj.createdAt} />
              </Link>
            ))}
          </div>
        </div>
      )}
    </article>
  )
}
