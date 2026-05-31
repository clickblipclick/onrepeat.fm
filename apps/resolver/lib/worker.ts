import type { PgBoss, JobWithMetadata, WorkWithMetadataHandler } from 'pg-boss' // v12 named exports
import type { DB } from '@onrepeat/db'
import { RESOLVE_QUEUE, type ResolveJob } from '@onrepeat/jobs'
import type { OdesliClient } from './odesli'
import { resolveTrack } from './resolve'

type ResolveJobMeta = JobWithMetadata<ResolveJob>

/** pg-boss work handler. Resolves each job; on transient failure, retries unless it's
 *  the final attempt, in which case it records `failed` so the track never stays pending. */
export function makeResolveHandler(db: DB, odesli: OdesliClient) {
  return async function handler(jobs: ResolveJobMeta[]): Promise<void> {
    for (const job of jobs) {
      try {
        await resolveTrack(db, odesli, job.data)
      } catch (err) {
        // Both transient and permanent errors land here; pg-boss retries until the
        // final attempt, when we record `failed` so the track never stays pending.
        if (job.retryCount < job.retryLimit) throw err // not the last attempt → let pg-boss retry
        console.error(`[resolver] giving up on ${job.data.identity} after ${job.retryCount} retries`, err)
        try {
          await db
            .updateTable('tracks')
            .set({ resolution_status: 'failed', resolved_at: new Date() })
            .where('id', '=', job.data.identity)
            .execute()
        } catch (writeErr) {
          // Couldn't even record the failure (e.g. a DB blip). Rethrow so pg-boss marks
          // the job failed (observable) rather than completed; the track stays pending.
          console.error(`[resolver] failed to record failed-status for ${job.data.identity}`, writeErr)
          throw writeErr
        }
      }
    }
  }
}

/** Register the worker on a started boss. Single worker, one job at a time. */
export async function startResolver(boss: PgBoss, db: DB, odesli: OdesliClient): Promise<void> {
  await boss.work<ResolveJob>(
    RESOLVE_QUEUE,
    { includeMetadata: true, localConcurrency: 1, pollingIntervalSeconds: 2 },
    // Cast: pg-boss's work() overloads don't narrow cleanly with includeMetadata: true,
    // and our handler returns Promise<void> vs the overload's Promise<any>. Don't remove.
    makeResolveHandler(db, odesli) as WorkWithMetadataHandler<ResolveJob>,
  )
}
