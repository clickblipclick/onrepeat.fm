import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getActorJams } from '@onrepeat/appview'
import { db } from '../../../lib/db'
import { hydrate, bsky } from '../../../lib/appview'
import { getSession } from '../../../lib/session'
import { readPreferredProvider } from '../../../lib/playback-preference.server'
import { JamCard, rkeyOf } from '../../_components/jam-card'
import { Avatar } from '../../_components/avatar'
import { isCurrentJam } from '../../../lib/format'

export default async function ProfilePage({ params }: { params: Promise<{ handle: string }> }) {
  const { handle } = await params
  const actor = decodeURIComponent(handle)
  const profile = await bsky.getProfile(actor)
  if (!profile) notFound()

  const session = await getSession()
  const preferredProvider = (await readPreferredProvider()) ?? undefined
  const page = await getActorJams(db, { did: profile.did, viewerDid: session.did, limit: 100 })
  const jams = await hydrate(page.jams)
  const current = jams[0] && isCurrentJam(jams[0].createdAt) ? jams[0] : null
  const archive = current ? jams.slice(1) : jams

  return (
    <>
      <div className="flex items-center gap-3">
        <Avatar author={profile} size={52} />
        <div>
          <div className="font-bold">{profile.displayName ?? profile.handle}</div>
          <div className="text-sm text-muted">@{profile.handle}</div>
        </div>
      </div>

      <h2 className="mt-6 mb-2 text-xs uppercase text-muted">Current jam</h2>
      {current ? (
        <JamCard jam={current} loggedIn={!!session.did} preferredProvider={preferredProvider} />
      ) : (
        <div className="rounded-md border border-dashed border-border p-6 text-center text-muted">hasn&apos;t jammed lately</div>
      )}

      {archive.length > 0 && (
        <>
          <h2 className="mt-6 mb-2 text-xs uppercase text-muted">Archive</h2>
          <div className="grid grid-cols-4 gap-2">
            {archive.map((jam) => (
              <Link key={jam.uri} href={`/jam/${encodeURIComponent(profile.handle ?? jam.authorDid)}/${rkeyOf(jam.uri)}`} className="block aspect-square overflow-hidden rounded border border-border" title={`${jam.title} — ${jam.artist}`}>
                {jam.artworkUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={jam.artworkUrl} alt={`${jam.title} by ${jam.artist}`} loading="lazy" className="h-full w-full object-cover" />
                ) : (
                  <span className="accent-grid block h-full w-full" />
                )}
              </Link>
            ))}
          </div>
            {page.cursor && (
              <p className="mt-2 text-xs text-muted">Showing the most recent 100 jams.</p>
            )}
        </>
      )}
    </>
  )
}
