import type { Updateable } from 'kysely'
import type { DB, TracksTable } from '@onrepeat/db'
import { providerTier } from '@onrepeat/core'
import type { ResolveJob } from '@onrepeat/jobs'
import type { OdesliClient } from './odesli'

/** Resolve one job onto its tracks row. Idempotent (keyed by job.identity). */
export async function resolveTrack(db: DB, odesli: OdesliClient, job: ResolveJob): Promise<void> {
  const now = new Date()

  if (providerTier(job.provider) === 'self-contained') {
    await db
      .updateTable('tracks')
      .set({
        provider_refs: JSON.stringify({ [job.provider]: { url: job.sourceUrl } }),
        resolution_status: 'self_contained',
        resolved_at: now,
      })
      .where('id', '=', job.identity)
      .execute()
    return
  }

  const result = await odesli.resolve(job.sourceUrl)
  if (result.notFound) {
    await db
      .updateTable('tracks')
      .set({ resolution_status: 'failed', resolved_at: now })
      .where('id', '=', job.identity)
      .execute()
    return
  }

  // Overwrite metadata only with the truthy values Odesli returned (skip
  // null/undefined/empty); keep the seeded jam values for anything missing.
  const update: Updateable<TracksTable> = {
    provider_refs: JSON.stringify(result.providerRefs),
    resolution_status: 'resolved',
    resolved_at: now,
  }
  if (result.title) update.title = result.title
  if (result.artist) update.artist = result.artist
  if (result.artworkUrl) update.artwork_url = result.artworkUrl

  await db.updateTable('tracks').set(update).where('id', '=', job.identity).execute()
}
