/**
 * Ad-hoc resolver harness — runs the same resolveTrack the worker uses, without
 * the DB or queue, and prints what each provider turned up.
 *
 * Usage (from apps/resolver):
 *   pnpm exec tsx --env-file-if-exists=.env.local scripts/try-resolve.ts <track url>
 *   pnpm exec tsx --env-file-if-exists=.env.local scripts/try-resolve.ts "<title>" "<artist>"
 *
 * YOUTUBE_API_KEY in .env.local enables the YouTube cross-resolution step;
 * without it the run is Apple-only, same as the worker.
 */
import {
  createItunesClient,
  createYoutubeClient,
  deriveTrack,
  resolveTrack,
  type FetchLike,
  type ResolveInput,
} from '@onrepeat/music'

/** Wrap fetch to trace each request — deriveTrack swallows fetch errors into
 *  coarse reasons ('transient'), so this is the only place the real cause shows. */
const tracingFetch: FetchLike = async (url, init) => {
  try {
    const res = await (globalThis.fetch as unknown as FetchLike)(url, init)
    console.error(`  fetch ${url} -> ${res.status}`)
    return res
  } catch (err) {
    const e = err as Error & { cause?: Error }
    console.error(
      `  fetch ${url} -> threw ${e.constructor.name}: ${e.message}${e.cause ? ` (${e.cause.message})` : ''}`,
    )
    throw err
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2)
  if (args.length === 0) {
    console.error(
      'usage: try-resolve.ts <track url>  |  try-resolve.ts "<title>" "<artist>"',
    )
    process.exit(1)
  }

  let input: ResolveInput
  if (/^https?:\/\//.test(args[0])) {
    const derived = await deriveTrack(args[0], { fetchFn: tracingFetch })
    if (!derived.ok) {
      console.error(`deriveTrack failed: ${derived.reason}`)
      process.exit(1)
    }
    console.log('derived candidate:')
    console.log(JSON.stringify(derived.candidate, null, 2))
    input = {
      sourceUrl: derived.candidate.sourceUrl,
      sourceProvider: derived.candidate.provider,
      title: derived.candidate.title,
      artist: derived.candidate.artist,
    }
  } else {
    if (args.length < 2) {
      console.error('title/artist mode needs two args: "<title>" "<artist>"')
      process.exit(1)
    }
    input = {
      sourceUrl: '',
      sourceProvider: null,
      title: args[0],
      artist: args[1],
    }
  }

  const youtubeKey = process.env.YOUTUBE_API_KEY
  const result = await resolveTrack(input, {
    itunes: createItunesClient({ minIntervalMs: 3000 }),
    youtube: youtubeKey
      ? createYoutubeClient({ apiKey: youtubeKey })
      : undefined,
  })

  console.log('\nresolution result:')
  console.log(JSON.stringify(result, null, 2))
}

void main()
