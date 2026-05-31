import { createDb } from '@onrepeat/db'
import { createBoss, createResolveQueue } from '@onrepeat/jobs'
import { createOdesliClient } from './odesli'
import { createRateLimiter } from './throttle'
import { startResolver } from './worker'
import { backfill } from './backfill'

function requireEnv(name: string): string {
  const v = process.env[name]
  if (!v) throw new Error(`missing required env ${name}`)
  return v
}

async function main(): Promise<void> {
  const databaseUrl = requireEnv('DATABASE_URL')
  const db = createDb(databaseUrl)
  const boss = createBoss(databaseUrl)
  await boss.start()
  await createResolveQueue(boss)

  if (process.argv.includes('--backfill')) {
    const n = await backfill(db, boss)
    console.log(`[resolver] backfill complete (${n})`)
    await boss.stop({ graceful: true })
    await db.destroy()
    process.exit(0)
  }

  // Built only for the worker path (not needed for --backfill).
  const odesli = createOdesliClient({ throttle: createRateLimiter({ minIntervalMs: 10_000 }) })

  let shuttingDown = false
  const shutdown = async (signal: string) => {
    if (shuttingDown) return
    shuttingDown = true
    console.log(`[resolver] received ${signal}, shutting down`)
    try {
      await boss.stop({ graceful: true })
      await db.destroy()
    } catch (err) {
      console.error('[resolver] error during shutdown', err)
      process.exit(1)
    }
    process.exit(0)
  }
  process.on('SIGINT', () => void shutdown('SIGINT'))
  process.on('SIGTERM', () => void shutdown('SIGTERM'))

  await startResolver(boss, db, odesli)
  console.log('[resolver] worker started')
}

main().catch((err) => {
  console.error('[resolver] fatal', err)
  process.exit(1)
})
