import { PgBoss } from 'pg-boss'

export const RESOLVE_QUEUE = 'resolve-track'

export interface ResolveJob {
  /** trackIdentity() result; doubles as tracks.id and the dedup key */
  identity: string
  sourceUrl: string
  provider: string
}

/** Build a PgBoss instance with the mandatory error handler. Caller must call start().
 *  Pass `{ supervise: false, schedule: false }` for a producer-only client (e.g. the web
 *  app enqueuing on write) so it doesn't run queue maintenance/cron — that stays owned by
 *  the ingester/resolver. */
export function createBoss(
  connectionString: string,
  options: { supervise?: boolean; schedule?: boolean } = {},
): PgBoss {
  const boss = new PgBoss({ connectionString, ...options })
  boss.on('error', (err) => console.error('[jobs] pg-boss error', err))
  return boss
}

/** Idempotently create the resolve queue and apply its retry/backoff config. */
export async function createResolveQueue(boss: PgBoss): Promise<void> {
  // policy 'short' dedups by singletonKey only while a prior job is still in the 'created'
  // state — once it's active or retrying, a re-enqueue is allowed (harmless: resolveJob is
  // idempotent). Options are Omit<Queue,'name'> — do NOT pass `name` here.
  const retry = {
    retryLimit: 5,
    retryDelay: 10, // seconds; with backoff → 10, 20, 40, 80, 160s
    retryBackoff: true,
    retryDelayMax: 600,
  }
  // createQueue is INSERT ... ON CONFLICT DO NOTHING, so on an existing queue it's a no-op
  // and config edits here wouldn't apply on redeploy. updateQueue applies the retry config
  // to the existing row (policy is immutable post-create, so it's only set at create time).
  // Both are concurrency-safe if the ingester + resolver start together.
  await boss.createQueue(RESOLVE_QUEUE, { policy: 'short', ...retry })
  await boss.updateQueue(RESOLVE_QUEUE, retry)
}

/** Enqueue a resolve job; dedups by identity (returns null if a job for it is still queued
 *  in the 'created' state — a job already active/retrying does not block a re-enqueue). */
export function enqueueResolve(
  boss: PgBoss,
  job: ResolveJob,
): Promise<string | null> {
  return boss.send(RESOLVE_QUEUE, job, { singletonKey: job.identity })
}
