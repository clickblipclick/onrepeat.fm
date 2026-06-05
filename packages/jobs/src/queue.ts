import { PgBoss } from 'pg-boss'

export const RESOLVE_QUEUE = 'resolve-track'

export interface ResolveJob {
  /** trackIdentity() result; doubles as tracks.id and the dedup key */
  identity: string
  sourceUrl: string
  provider: string
}

/** Build a PgBoss instance with the mandatory error handler. Caller must call start(). */
export function createBoss(connectionString: string): PgBoss {
  const boss = new PgBoss(connectionString)
  boss.on('error', (err) => console.error('[jobs] pg-boss error', err))
  return boss
}

/** Idempotently create the resolve queue with retry/backoff config. */
export async function createResolveQueue(boss: PgBoss): Promise<void> {
  // policy 'short' enables singletonKey dedup (≤1 queued job per identity).
  // Options are Omit<Queue,'name'> — do NOT pass `name` here.
  try {
    await boss.createQueue(RESOLVE_QUEUE, {
      policy: 'short',
      retryLimit: 5,
      retryDelay: 10, // seconds; with backoff → 10, 20, 40, 80, 160s
      retryBackoff: true,
      retryDelayMax: 600,
    })
  } catch (err) {
    // Tolerate a concurrent create (ingester + resolver may start together):
    // if the queue now exists the race resolved fine; otherwise rethrow.
    if (!(await boss.getQueue(RESOLVE_QUEUE))) throw err
  }
}

/** Enqueue a resolve job; dedups by identity (returns null if a job for it is already queued). */
export function enqueueResolve(
  boss: PgBoss,
  job: ResolveJob,
): Promise<string | null> {
  return boss.send(RESOLVE_QUEUE, job, { singletonKey: job.identity })
}
