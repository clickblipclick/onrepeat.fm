import { cache } from 'react'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { getJam } from '@onrepeat/appview'
import { db } from '../../../../../lib/db'
import { hydrate, bsky } from '../../../../../lib/appview'
import { buildJamOgMeta } from '../../../../../lib/share'
import { getSession } from '../../../../../lib/session'
import { APP_URL } from '../../../../../lib/session-config'
import { readPreferredProvider } from '../../../../../lib/playback-preference.server'
import { Player } from '../../../../_components/player'
import {
  PlaybackProvider,
  PlaybackSwitcher,
} from '../../../../_components/playback'
import { authorName, type DisplayAuthor } from '../../../../_components/avatar'
import { RelativeTime } from '../../../../_components/relative-time'
import {
  JamHeader,
  JamBody,
  JamActions,
} from '../../../../_components/jam-parts'
import {
  JamCardShell,
  MediaFrame,
} from '../../../../_components/jam-card-shell'
import { LikeProvider, LikedBy } from '../../../../_components/liked-by'
import { SectionLabel } from '../../../../_components/section-label'

// Inlined (canonical source: JAM_NSID in @onrepeat/lexicons) to avoid adding that
// workspace dep for a single constant. Consolidate if apps/web needs more lexicon values.
const JAM_NSID = 'fm.onrepeat.jam'

// `handle` is a handle (pretty links) or a DID (older/shared links); resolve once
// per request for both generateMetadata and the page body.
const resolveAuthorDid = cache(async (actorDecoded: string) => {
  if (actorDecoded.startsWith('did:')) return actorDecoded
  const prof = await bsky.getProfile(actorDecoded)
  return prof?.did ?? null
})

// Full jam detail, deduped between generateMetadata and the page body — getJam
// loads likers + re-jams too, so running it twice per request would double the
// page's DB work. Same (uri, viewerDid) args → one query set per request.
const loadJam = cache((uri: string, viewerDid?: string) =>
  getJam(db, { uri, viewerDid }),
)

export async function generateMetadata({
  params,
}: {
  params: Promise<{ handle: string; rkey: string }>
}): Promise<Metadata> {
  const { handle, rkey } = await params
  const authorDid = await resolveAuthorDid(decodeURIComponent(handle))
  if (!authorDid) notFound()
  const uri = `at://${authorDid}/${JAM_NSID}/${decodeURIComponent(rkey)}`
  const session = await getSession()
  const detail = await loadJam(uri, session.did)
  if (!detail) notFound()
  const [hydrated] = await hydrate([detail.jam])
  const label = hydrated
    ? authorName(hydrated.author)
    : decodeURIComponent(handle)
  const og = buildJamOgMeta({
    title: detail.jam.title,
    artist: detail.jam.artist,
    authorLabel: label,
  })
  return {
    title: og.title,
    description: og.description,
    openGraph: {
      title: og.title,
      description: og.description,
      type: 'music.song',
    },
    twitter: {
      card: 'summary_large_image',
      title: og.title,
      description: og.description,
    },
  }
}

export default async function JamPage({
  params,
}: {
  params: Promise<{ handle: string; rkey: string }>
}) {
  const { handle, rkey } = await params
  // `handle` is a handle (pretty links) or a DID (older/shared links). Records are keyed
  // by DID, so resolve a handle to its DID before building the at-uri.
  const actorDecoded = decodeURIComponent(handle)
  const authorDid = await resolveAuthorDid(actorDecoded)
  if (!authorDid) notFound()
  const uri = `at://${authorDid}/${JAM_NSID}/${decodeURIComponent(rkey)}`
  const session = await getSession()
  const preferredProvider = (await readPreferredProvider()) ?? undefined
  const detail = await loadJam(uri, session.did)
  if (!detail) notFound()

  const hydrated = await hydrate([detail.jam])
  const jam = hydrated[0]
  if (!jam) notFound()
  const reJams = await hydrate(detail.reJams)
  // Liker avatars are enrichment: degrade to DID-only on a bsky outage rather than erroring
  // the page. The viewer's profile rides along so their avatar is ready if they like the jam.
  const likerProfiles: Record<string, DisplayAuthor> = {}
  try {
    const dids = session.did
      ? [...detail.likerDids, session.did]
      : detail.likerDids
    for (const [did, p] of await bsky.getProfiles(dids)) {
      if (p) likerProfiles[did] = p
    }
  } catch {
    // leave likerProfiles empty → DID-only avatars
  }
  const profileHref = `/profile/${encodeURIComponent(jam.author.handle ?? jam.authorDid)}`
  const jamShareUrl = `${APP_URL}${profileHref}/jam/${jam.uri.split('/').pop()}`

  return (
    // Mirrors the feed/profile JamCard chrome (shared via jam-parts) for visual
    // consistency, minus the hover lift — the whole card isn't a link here, you're
    // already on the post — and plus the detail-only "liked by" / "re-jams" sections.
    <JamCardShell did={jam.authorDid} theme={jam.author.theme}>
      <JamHeader
        jam={jam}
        viewerDid={session.did}
        showCurrentJam
        redirectTo={profileHref}
      />

      {/* One playback scope: the hero player and the service switcher (beside the
          title) share state, so switching works mid-play. */}
      <PlaybackProvider
        sourceProvider={jam.sourceProvider}
        providerRefs={jam.providerRefs}
        sourceUrl={jam.sourceUrl}
        preferredProvider={preferredProvider}
      >
        <MediaFrame>
          <Player
            artworkUrl={jam.artworkUrl}
            title={jam.title}
            artist={jam.artist}
            priority // the jam detail cover is the page hero/LCP image
          />
        </MediaFrame>

        <div className="px-4 pb-4">
          <div className="flex items-baseline justify-between gap-3">
            <div className="min-w-0 flex-1">
              <JamBody jam={jam} />
            </div>
            <PlaybackSwitcher />
          </div>
          <LikeProvider>
            <div className="mt-3 flex items-center gap-4 border-t border-border pt-2 text-sm text-muted">
              <JamActions jam={jam} loggedIn={!!session.did} jamUrl={jamShareUrl} />
            </div>

            <LikedBy
              likerDids={detail.likerDids}
              profiles={likerProfiles}
              viewerDid={session.did}
            />
          </LikeProvider>

          {reJams.length > 0 && (
            <div className="mt-4">
              <SectionLabel flush>Re-jams ({reJams.length})</SectionLabel>
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
        </div>
      </PlaybackProvider>
    </JamCardShell>
  )
}
