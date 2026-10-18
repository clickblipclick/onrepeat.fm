import { createDb } from '@onrepeat/db'
import {
  createBoss,
  createResolveQueue,
  enqueueResolveForJam,
} from '@onrepeat/jobs'
import type { JamRecord } from '@onrepeat/lexicons'
import { onShutdown, requireEnv } from '@onrepeat/service'

import { createIngester, DEFAULT_JETSTREAM_URL } from './jetstream'
import { parseStartCursorOverride } from './start-cursor'

async function main(): Promise<void> {
  const databaseUrl = requireEnv('DATABASE_URL')
  const service = process.env.JETSTREAM_URL ?? DEFAULT_JETSTREAM_URL
  // Recovery escape hatch (a seq, or a unix-µs timestamp); rejected loudly if malformed.
  const startCursor = parseStartCursorOverride(
    process.env.INGESTER_START_CURSOR,
  )

  const db = createDb(databaseUrl)
  const boss = createBoss(databaseUrl)
  await boss.start()
  await createResolveQueue(boss)

  const ingester = await createIngester({
    db,
    service,
    // Dev convenience: tail the live head instead of replaying from a stale cursor.
    liveTail: process.env.INGESTER_LIVE_TAIL === '1',
    startCursor,
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

  // start() kicks off the Jetstream subscription and returns immediately; the process
  // stays alive via the open WebSocket. Errors during the stream are logged by the
  // subscription loop (which reconnects on its own), not surfaced here.
  await ingester.start()
}

main().catch((err) => {
  console.error('[ingester] fatal', err)
  process.exit(1)
})
