import type { PgBoss, JobWithMetadata, WorkWithMetadataHandler } from 'pg-boss' // v12 named exports
import type { DB } from '@onrepeat/db'
import { RESOLVE_QUEUE, type ResolveJob } from '@onrepeat/jobs'
import { resolveJob, type ResolverDeps } from './resolve'

type ResolveJobMeta = JobWithMetadata<ResolveJob>

/** pg-boss work handler. Resolves each job; on transient failure, retries unless it's
 *  the final attempt, in which case it records `failed` so the track never stays pending. */
export function makeResolveHandler(db: DB, deps: ResolverDeps) {
  return async function handler(jobs: ResolveJobMeta[]): Promise<void> {
    // Assumes batchSize 1 (pg-boss default; startResolver doesn't override it): a throw on a
    // retry-remaining error aborts the rest of the batch. Fine at batchSize 1; if batch size
    // is ever raised, restructure so one job's retry doesn't skip the others.
    for (const job of jobs) {
      try {
        await resolveJob(db, deps, job.data)
      } catch (err) {
        if (job.retryCount < job.retryLimit) throw err // not the last attempt → let pg-boss retry
        console.error(`[resolver] giving up on ${job.data.identity} after ${job.retryCount} retries`, err)
        try {
          await db
            .updateTable('tracks')
            .set({ resolution_status: 'failed', resolved_at: new Date() })
            .where('id', '=', job.data.identity)
            .execute()
        } catch (writeErr) {
          console.error(`[resolver] failed to record failed-status for ${job.data.identity}`, writeErr)
          throw writeErr
        }
      }
    }
  }
}

/** Register the worker on a started boss. Single worker, one job at a time. */
export async function startResolver(boss: PgBoss, db: DB, deps: ResolverDeps): Promise<void> {
  await boss.work<ResolveJob>(
    RESOLVE_QUEUE,
    { includeMetadata: true, localConcurrency: 1, pollingIntervalSeconds: 2 },
    makeResolveHandler(db, deps) as WorkWithMetadataHandler<ResolveJob>,
  )
}
