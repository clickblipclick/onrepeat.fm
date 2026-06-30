import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { cache, Suspense } from 'react'

import {
  getActorJams,
  getFollowCounts,
  isFollowing,
  loadActorThemes,
} from '@onrepeat/appview'
import { resolveTheme } from '@onrepeat/core'

import { ArchiveGrid } from '@/app/_components/archive-grid'
import { Avatar } from '@/app/_components/avatar'
import { EmptyState } from '@/app/_components/empty-state'
import { FollowButton } from '@/app/_components/follow-button'
import { HtmlTheme } from '@/app/_components/html-theme'
import { JamCard } from '@/app/_components/jam-card'
import { JamCardSkeleton } from '@/app/_components/jam-card-skeleton'
import { SectionLabel } from '@/app/_components/section-label'
import { bsky, hydrate } from '@/lib/appview'
import { db } from '@/lib/db'
import { isCurrentJam } from '@/lib/format'
import { readPreferredProvider } from '@/lib/playback-preference.server'
import { getSession } from '@/lib/session'

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
  // the app wears the viewer's own theme).
  const themes = await loadActorThemes(db, [profile.did])
  const ownerTheme = resolveTheme(themes.get(profile.did), profile.did)

  const isOwnProfile = session.did === profile.did
  const [counts, viewerFollows] = await Promise.all([
    getFollowCounts(db, profile.did),
    session.did && !isOwnProfile
      ? isFollowing(db, session.did, profile.did)
      : Promise.resolve(false),
  ])

  return (
    <>
      {/* Theme <html> with the owner's color while this profile is open (nav, background,
          cards); reverts to the viewer's own theme on navigate-away. */}
      <HtmlTheme theme={ownerTheme} />
      <div className="flex items-center gap-3">
        <Avatar author={profile} size={68} />
        <div className="flex-1">
          <h1 className="font-bold">{profile.displayName ?? profile.handle}</h1>
          <div className="text-sm text-muted">@{profile.handle}</div>
          <div className="mt-1 text-sm text-muted">
            <span className="font-medium">{counts.followers}</span> followers ·{' '}
            <span className="font-medium">{counts.following}</span> following
          </div>
        </div>
        {!isOwnProfile && (
          <FollowButton
            subjectDid={profile.did}
            initialFollowing={viewerFollows}
            loggedIn={!!session.did}
          />
        )}
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
