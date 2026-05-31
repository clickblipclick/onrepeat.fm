import { createDb } from '@onrepeat/db'
import type { JamRecord } from '@onrepeat/lexicons'
import { createBoss, createResolveQueue, enqueueResolveForJam } from '@onrepeat/jobs'
import { createIngester } from './firehose'

function requireEnv(name: string): string {
  const v = process.env[name]
  if (!v) throw new Error(`missing required env ${name}`)
  return v
}

async function main(): Promise<void> {
  const databaseUrl = requireEnv('DATABASE_URL')
  const relay = process.env.RELAY_URL ?? 'wss://bsky.network'

  const db = createDb(databaseUrl)
  const boss = createBoss(databaseUrl)
  await boss.start()
  await createResolveQueue(boss)

  const ingester = await createIngester({
    db,
    relay,
    hooks: {
      onJamIndexed: (evt) =>
        enqueueResolveForJam(boss, db, { uri: evt.uri, record: evt.record as JamRecord }),
    },
  })

  let shuttingDown = false
  const shutdown = async (signal: string) => {
    if (shuttingDown) return
    shuttingDown = true
    console.log(`[ingester] received ${signal}, shutting down`)
    try {
      await ingester.stop()
      await boss.stop({ graceful: true })
      await db.destroy()
    } catch (err) {
      console.error('[ingester] error during shutdown', err)
      process.exit(1)
    }
    process.exit(0)
  }
  process.on('SIGINT', () => void shutdown('SIGINT'))
  process.on('SIGTERM', () => void shutdown('SIGTERM'))

  // start() kicks off the firehose subscription and returns immediately; the process
  // stays alive via the open WebSocket. Errors during the stream go to onError, not here.
  await ingester.start()
}

main().catch((err) => {
  console.error('[ingester] fatal', err)
  process.exit(1)
})
