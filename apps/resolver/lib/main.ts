import { createDb } from '@onrepeat/db'
import { createBoss, createResolveQueue } from '@onrepeat/jobs'
import {
  createItunesClient,
  createYoutubeClient,
  fetchBandcampEmbed,
  fetchOembed,
} from '@onrepeat/music'
import { onShutdown, requireEnv } from '@onrepeat/service'
import { createR2Store, persistArtwork } from '@onrepeat/storage'

import { backfill } from './backfill'
import { backfillArtwork } from './backfill-artwork'
import type { ResolverDeps } from './resolve'
import { startResolver } from './worker'

/** Build the R2 artwork store from env, or null when any required var is unset. */
function buildArtworkStore(): ReturnType<typeof createR2Store> | null {
  const accountId = process.env.R2_ACCOUNT_ID
  const accessKeyId = process.env.R2_ACCESS_KEY_ID
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY
  const bucket = process.env.R2_BUCKET
  const publicBaseUrl = process.env.ARTWORK_CDN_BASE_URL
  if (
    !accountId ||
    !accessKeyId ||
    !secretAccessKey ||
    !bucket ||
    !publicBaseUrl
  )
    return null
  return createR2Store({
    accountId,
    accessKeyId,
    secretAccessKey,
    bucket,
    publicBaseUrl,
  })
}

async function main(): Promise<void> {
  const databaseUrl = requireEnv('DATABASE_URL')
  const db = createDb(databaseUrl)
  const boss = createBoss(databaseUrl)
  await boss.start()
  await createResolveQueue(boss)

  const store = buildArtworkStore()

  if (process.argv.includes('--backfill')) {
    const n = await backfill(db, boss)
    console.log(`[resolver] backfill complete (${n})`)
    await boss.stop({ graceful: true })
    await db.destroy()
    process.exit(0)
  }

  if (process.argv.includes('--backfill-artwork')) {
    if (!store) {
      console.error(
        '[resolver] --backfill-artwork requires R2_* + ARTWORK_CDN_BASE_URL env',
      )
      await boss.stop({ graceful: true })
      await db.destroy()
      process.exit(1)
    }
    const n = await backfillArtwork(db, store)
    console.log(`[resolver] artwork backfill complete (${n} persisted)`)
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

  if (store) {
    deps.persistArtwork = (artworkUrl) => persistArtwork(artworkUrl, store)
    console.log('[resolver] artwork persistence enabled (R2)')
  } else {
    console.warn(
      '[resolver] R2 env not set — album art will not be self-hosted',
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
