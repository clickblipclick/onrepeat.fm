import { notFound } from 'next/navigation'
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

export default async function ProfilePage({
  params,
}: {
  params: Promise<{ handle: string }>
}) {
  const { handle } = await params
  const actor = decodeURIComponent(handle)
  const profile = await bsky.getProfile(actor)
  if (!profile) notFound()

  const session = await getSession()
  const preferredProvider = (await readPreferredProvider()) ?? undefined
  const page = await getActorJams(db, {
    did: profile.did,
    viewerDid: session.did,
    limit: 100,
  })
  const jams = await hydrate(page.jams)
  const current = jams[0] && isCurrentJam(jams[0].createdAt) ? jams[0] : null
  const archive = current ? jams.slice(1) : jams

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
          <div className="font-bold">
            {profile.displayName ?? profile.handle}
          </div>
          <div className="text-sm text-muted">@{profile.handle}</div>
        </div>
      </div>

      <h2 className="mt-6 mb-2 text-xs text-muted uppercase">Current jam</h2>
      {current ? (
        <JamCard
          jam={current}
          loggedIn={!!session.did}
          viewerDid={session.did}
          priority // the profile's current jam is its hero/LCP image
          preferredProvider={preferredProvider}
        />
      ) : (
        <div className="rounded-md border border-dashed border-border p-6 text-center text-muted">
          hasn&apos;t jammed lately
        </div>
      )}

      {archive.length > 0 && (
        <>
          <h2 className="mt-6 mb-2 text-xs text-muted uppercase">Archive</h2>
          <ArchiveGrid
            did={profile.did}
            handle={profile.handle ?? profile.did}
            initial={archive}
            initialCursor={page.cursor}
          />
        </>
      )}
    </>
  )
}
