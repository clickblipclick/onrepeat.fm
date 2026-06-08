import { createBoss, createResolveQueue } from '@onrepeat/jobs'

const databaseUrl = process.env.DATABASE_URL
if (!databaseUrl) throw new Error('DATABASE_URL must be set')

type Boss = ReturnType<typeof createBoss>

// Producer-only pg-boss: the web app enqueues resolve jobs on write (read-your-writes) so a
// jam resolves immediately instead of waiting on the firehose round-trip. supervise/schedule
// are off — queue maintenance/cron stays owned by the ingester/resolver. Started once and
// cached (a Promise so concurrent callers share one start); survives dev hot reloads.
const globalForBoss = globalThis as unknown as {
  __onrepeatBoss?: Promise<Boss>
}

async function startBoss(): Promise<Boss> {
  const boss = createBoss(databaseUrl!, { supervise: false, schedule: false })
  await boss.start()
  await createResolveQueue(boss) // idempotent; ensures the queue exists if web wins the race
  return boss
}

export function getBoss(): Promise<Boss> {
  if (!globalForBoss.__onrepeatBoss) {
    globalForBoss.__onrepeatBoss = startBoss().catch((err) => {
      // Don't pin a rejected promise — let the next enqueue retry the connection.
      globalForBoss.__onrepeatBoss = undefined
      throw err
    })
  }
  return globalForBoss.__onrepeatBoss
}
