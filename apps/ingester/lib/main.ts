import { createDb } from '@onrepeat/db'
import type { JamRecord } from '@onrepeat/lexicons'
import {
  createBoss,
  createResolveQueue,
  enqueueResolveForJam,
} from '@onrepeat/jobs'
import { requireEnv, onShutdown } from '@onrepeat/service'
import { createIngester } from './firehose'

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
    // Dev convenience: tail the live head instead of replaying from a stale cursor.
    liveTail: process.env.INGESTER_LIVE_TAIL === '1',
    hooks: {
      onJamIndexed: (evt) =>
        enqueueResolveForJam(boss, db, {
          uri: evt.uri,
          record: evt.record as JamRecord,
        }),
    },
  })

  onShutdown('ingester', async () => {
    await ingester.stop()
    await boss.stop({ graceful: true })
    await db.destroy()
  })

  // start() kicks off the firehose subscription and returns immediately; the process
  // stays alive via the open WebSocket. Errors during the stream go to onError, not here.
  await ingester.start()
}

main().catch((err) => {
  console.error('[ingester] fatal', err)
  process.exit(1)
})
