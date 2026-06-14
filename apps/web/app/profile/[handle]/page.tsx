import { cache, Suspense } from 'react'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { getActorJams, loadActorThemes } from '@onrepeat/appview'
import { resolveTheme } from '@onrepeat/core'
import { db } from '../../../lib/db'
import { hydrate, bsky } from '../../../lib/appview'
import { getSession } from '../../../lib/session'
import { readPreferredProvider } from '../../../lib/playback-preference.server'
import { JamCard } from '../../_components/jam-card'
import { ArchiveGrid } from '../../_components/archive-grid'
import { Avatar } from '../../_components/avatar'
import { HtmlTheme } from '../../_components/html-theme'
import { isCurrentJam } from '../../../lib/format'
import { SectionLabel } from '../../_components/section-label'
import { EmptyState } from '../../_components/empty-state'
import { JamCardSkeleton } from '../../_components/jam-card-skeleton'

// One bsky.getProfile call per request, shared by generateMetadata and the page
// body (bsky's own ~30min TTL cache sits underneath, but cache() guarantees
// dedupe within the request even on cache misses).
const getProfile = cache((actor: string) => bsky.getProfile(actor))

export async function generateMetadata({
  params,
}: {
  params: Promise<{ handle: string }>
}): Promise<Metadata> {
  const { handle } = await params
  const profile = await getProfile(decodeURIComponent(handle))
  // Thrown here, before streaming starts, so the response status is a real 404
  // (the page body's notFound() fires after the root loading shell flushes a 200).
  if (!profile) notFound()
  return {
    title: `${profile.displayName ?? profile.handle} · onrepeat.fm`,
  }
}

async function ProfileJams({
  did,
  handle,
  viewerDid,
  preferredProvider,
}: {
  did: string
  handle: string
  viewerDid?: string
  preferredProvider?: string
}) {
  const page = await getActorJams(db, { did, viewerDid, limit: 100 })
  const jams = await hydrate(page.jams)
  const current = jams[0] && isCurrentJam(jams[0].createdAt) ? jams[0] : null
  const archive = current ? jams.slice(1) : jams

  return (
    <>
      <SectionLabel>On repeat</SectionLabel>
      {current ? (
        <JamCard
          jam={current}
          loggedIn={!!viewerDid}
          viewerDid={viewerDid}
          priority // the profile's current jam is its hero/LCP image
          preferredProvider={preferredProvider}
        />
      ) : (
        <EmptyState>nothing on repeat lately</EmptyState>
      )}

      {archive.length > 0 && (
        <>
          <SectionLabel>Archive</SectionLabel>
          <ArchiveGrid
            did={did}
            handle={handle}
            initial={archive}
            initialCursor={page.cursor}
          />
        </>
      )}
    </>
  )
}

export default async function ProfilePage({
  params,
}: {
  params: Promise<{ handle: string }>
}) {
  const { handle } = await params
  const actor = decodeURIComponent(handle)
  const profile = await getProfile(actor)
  if (!profile) notFound()

  const session = await getSession()
  const preferredProvider = (await readPreferredProvider()) ?? undefined

  // The profile page wears its owner's color theme across the whole shell (the rest of
  // the app is neutral mono).
  const themes = await loadActorThemes(db, [profile.did])
  const ownerTheme = resolveTheme(themes.get(profile.did), profile.did)

  return (
    <>
      {/* Theme <html> with the owner's color while this profile is open (nav, background,
          cards); reverts to the neutral chrome on navigate-away. */}
      <HtmlTheme theme={ownerTheme} />
      <div className="flex items-center gap-3">
        <Avatar author={profile} size={52} />
        <div>
          <h1 className="font-bold">{profile.displayName ?? profile.handle}</h1>
          <div className="text-sm text-muted">@{profile.handle}</div>
        </div>
      </div>

      <Suspense fallback={<JamCardSkeleton />}>
        <ProfileJams
          did={profile.did}
          handle={profile.handle ?? profile.did}
          viewerDid={session.did}
          preferredProvider={preferredProvider}
        />
      </Suspense>
    </>
  )
}
