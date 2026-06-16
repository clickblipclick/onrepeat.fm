import { createDb } from '@onrepeat/db'
import { createBoss, createResolveQueue } from '@onrepeat/jobs'
import {
  createItunesClient,
  createYoutubeClient,
  fetchBandcampEmbed,
  fetchOembed,
} from '@onrepeat/music'
import { requireEnv, onShutdown } from '@onrepeat/service'
import type { ResolverDeps } from './resolve'
import { startResolver } from './worker'
import { backfill } from './backfill'

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

  // Built only for the worker path. iTunes is keyless (always on); YouTube needs a
  // key (optional — absent → Apple-only cross-resolution); Bandcamp embeds via scrape.
  const deps: ResolverDeps = {
    // Pace external calls: backfill drains the whole queue through this single worker,
    // so client-side throttling keeps it under iTunes' ~20 req/min (≥3s apart) and stops
    // YouTube quota bursts. Interactive web track-search uses the standalone fns (unpaced).
    itunes: createItunesClient({ minIntervalMs: 3000 }),
    bandcamp: (url) => fetchBandcampEmbed(url),
    oembed: (provider, url) => fetchOembed(provider, url),
  }
  if (process.env.YOUTUBE_API_KEY) {
    deps.youtube = createYoutubeClient({
      apiKey: process.env.YOUTUBE_API_KEY,
      minIntervalMs: 250,
    })
  } else {
    console.warn(
      '[resolver] YOUTUBE_API_KEY not set — YouTube cross-links disabled',
    )
  }

  onShutdown('resolver', async () => {
    await boss.stop({ graceful: true })
    await db.destroy()
  })

  await startResolver(boss, db, deps)
  console.log('[resolver] worker started')
}

main().catch((err) => {
  console.error('[resolver] fatal', err)
  process.exit(1)
})
