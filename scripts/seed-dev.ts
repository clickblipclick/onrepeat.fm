/**
 * Dev-only seed: populate the local index with jams from a curated list of real, public
 * Bluesky accounts so the feeds/profiles/themes have something to look at. Uses REAL DIDs
 * because the appview hydrates author profiles from bsky at read time and the profile page
 * 404s for DIDs bsky can't resolve. Song metadata + artwork come from the iTunes Search API
 * (Apple-Music URLs also give working embeds). Nothing is written to anyone's PDS — these
 * are local index rows only.
 *
 * Run:   pnpm --filter @onrepeat/db exec tsx /ABS/PATH/scripts/seed-dev.ts
 * Reset: ...seed-dev.ts --clean  — deletes the seed jams + likes and reverts the seeded
 *        accounts' themes, restoring the pre-seed state (your own data is left untouched).
 *
 * Idempotent: seed rows use deterministic `seed-` rkeys, so re-running upserts in place.
 */
// Import straight from package sources (this script lives outside any package, so the
// workspace `@onrepeat/*` symlinks aren't on its resolution path). Each file's own
// deps still resolve from its package's node_modules.
import { createDb } from '../packages/db/src/client'
import { THEMES } from '../packages/core/src/theme'

const DB_URL =
  process.env.DATABASE_URL ??
  'postgres://onrepeat:onrepeat@127.0.0.1:5432/onrepeat_test'

// Safety: this writes seed rows into whatever DATABASE_URL points at. Refuse to run against
// a non-local host or in production so it can't accidentally pollute a deployed database.
function assertLocalSeedTarget(url: string): void {
  const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', ''])
  let host: string
  try {
    host = new URL(url).hostname
  } catch {
    throw new Error(`[seed] invalid DATABASE_URL: '${url}'`)
  }
  if (process.env.NODE_ENV === 'production' || !LOCAL_HOSTS.has(host)) {
    throw new Error(
      `[seed] refusing to seed a non-local/production database (host '${host}'). ` +
        `The dev seed is for local Postgres only.`,
    )
  }
}
assertLocalSeedTarget(DB_URL)

const BSKY = 'https://public.api.bsky.app/xrpc'

// Real handles to attribute jams to (merged with your follows). getProfiles silently
// drops any that don't resolve, so a few misses here are fine.
const CURATED = [
  'jay.bsky.team',
  'pfrazee.com',
  'why.bsky.team',
  'danabra.mov',
  'safety.bsky.app',
  'nytimes.com',
  'theverge.com',
  'npr.org',
  'theonion.com',
  'mozilla.org',
  'wired.com',
  'nasa.gov',
  'arstechnica.com',
  'pitchfork.com',
]

const SONG_QUERIES = [
  'Blinding Lights The Weeknd',
  'Mr Brightside The Killers',
  'Dreams Fleetwood Mac',
  'Bad Guy Billie Eilish',
  'Heat Waves Glass Animals',
  'Take On Me a-ha',
  'Get Lucky Daft Punk',
  'Redbone Childish Gambino',
  'The Less I Know The Better Tame Impala',
  'Nightcall Kavinsky',
  'Midnight City M83',
  'As It Was Harry Styles',
  'Pink Pony Club Chappell Roan',
  'Vampire Olivia Rodrigo',
  'Flowers Miley Cyrus',
  'Electric Feel MGMT',
  'Float On Modest Mouse',
  '1979 Smashing Pumpkins',
  'Such Great Heights The Postal Service',
  'Dog Days Are Over Florence and the Machine',
]

const CAPTIONS = [
  'on repeat all week',
  'this one still hits',
  'found a gem',
  "can't stop replaying this",
  'soundtrack to my week',
  'perfect for right now',
  'an oldie but a goodie',
  'turn it up',
]

interface Author {
  did: string
  handle: string
}
interface Song {
  title: string
  artist: string
  artwork: string
  url: string
}

async function getJSON<T>(url: string): Promise<T> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`${res.status} ${url}`)
  return (await res.json()) as T
}

/** A non-null, unique-per-uri placeholder CID (real CIDs come from the firehose). */
function fakeCid(uri: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < uri.length; i++) {
    h ^= uri.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return 'bafyreigseed' + (h >>> 0).toString(32).padStart(7, '0')
}

async function resolveAuthors(): Promise<Author[]> {
  const resolved: Author[] = []
  for (let i = 0; i < CURATED.length; i += 25) {
    const batch = CURATED.slice(i, i + 25)
    const qs = batch.map((a) => `actors=${encodeURIComponent(a)}`).join('&')
    try {
      const r = await getJSON<{ profiles: { did: string; handle: string }[] }>(
        `${BSKY}/app.bsky.actor.getProfiles?${qs}`,
      )
      for (const p of r.profiles)
        resolved.push({ did: p.did, handle: p.handle })
    } catch (e) {
      console.warn('[seed] getProfiles batch failed:', String(e))
    }
  }
  // Dedupe by DID, cap to a manageable number.
  const seen = new Set<string>()
  return resolved
    .filter((a) => {
      if (seen.has(a.did)) return false
      seen.add(a.did)
      return true
    })
    .slice(0, 12)
}

async function fetchSongs(): Promise<Song[]> {
  const songs: Song[] = []
  for (const q of SONG_QUERIES) {
    try {
      const r = await getJSON<{
        results: {
          trackName: string
          artistName: string
          artworkUrl100?: string
          trackViewUrl?: string
        }[]
      }>(
        `https://itunes.apple.com/search?term=${encodeURIComponent(q)}&entity=song&limit=1`,
      )
      const t = r.results?.[0]
      if (t?.trackViewUrl && t.artworkUrl100) {
        songs.push({
          title: t.trackName,
          artist: t.artistName,
          artwork: t.artworkUrl100.replace('100x100', '600x600'),
          url: t.trackViewUrl,
        })
      }
    } catch (e) {
      console.warn(`[seed] iTunes "${q}" failed:`, String(e))
    }
  }
  return songs
}

async function clean(db: ReturnType<typeof createDb>): Promise<void> {
  await db
    .deleteFrom('likes')
    .where('uri', 'like', '%/fm.onrepeat.like/seedlike-%')
    .execute()
  await db
    .deleteFrom('jams')
    .where('uri', 'like', '%/fm.onrepeat.jam/seed-%')
    .execute()
  // Revert themes on accounts that have no jams left — i.e. the seeded-only accounts.
  // Anyone with real jams (including you) keeps their chosen theme, so this is a no-op
  // on real data and restores the pre-seed state.
  await db
    .updateTable('actors')
    .set({ color_theme: null })
    .where('color_theme', 'is not', null)
    .where('did', 'not in', db.selectFrom('jams').select('author_did'))
    .execute()
  console.log(
    '[seed] reverted: removed seed jams + likes, reset themes on jamless accounts',
  )
}

async function main(): Promise<void> {
  const db = createDb(DB_URL)
  try {
    if (process.argv.includes('--clean')) {
      await clean(db)
      return
    }

    const authors = await resolveAuthors()
    if (authors.length === 0) throw new Error('no real authors resolved')
    const songs = await fetchSongs()
    if (songs.length === 0) throw new Error('no songs fetched from iTunes')
    console.log(
      `[seed] ${authors.length} authors, ${songs.length} songs:`,
      authors.map((a) => a.handle).join(', '),
    )

    const now = Date.now()
    const HOUR = 3600_000
    const jamUris: { uri: string; did: string }[] = []
    let songIdx = 0

    for (let i = 0; i < authors.length; i++) {
      const a = authors[i]!
      // Cover all six themes across the first authors; leave the last two on their
      // DID-derived default so that path is visible too.
      const theme = i >= authors.length - 2 ? null : THEMES[i % THEMES.length]
      await db
        .insertInto('actors')
        .values({ did: a.did, color_theme: theme, last_seen: new Date() })
        .onConflict((oc) =>
          oc
            .column('did')
            .doUpdateSet({ color_theme: theme, last_seen: new Date() }),
        )
        .execute()

      const count = 2 + (i % 3) // 2..4 jams each
      for (let j = 0; j < count; j++) {
        const song = songs[songIdx++ % songs.length]!
        const rkey = `seed-${i}-${j}`
        const uri = `at://${a.did}/fm.onrepeat.jam/${rkey}`
        // j=0 is recent (the "current jam"); later ones recede into the archive.
        const createdAt = new Date(now - (j * 38 + i * 5) * HOUR)
        const caption = j === 0 ? CAPTIONS[i % CAPTIONS.length]! : null
        const row = {
          uri,
          cid: fakeCid(uri),
          author_did: a.did,
          track_id: null,
          source_url: song.url,
          source_provider: 'applemusic',
          raw_title: song.title,
          raw_artist: song.artist,
          raw_artwork_url: song.artwork,
          caption,
          via_uri: null as string | null,
          via_did: null as string | null,
          created_at: createdAt,
        }
        await db
          .insertInto('jams')
          .values(row)
          .onConflict((oc) =>
            oc.column('uri').doUpdateSet({
              cid: row.cid,
              source_url: row.source_url,
              source_provider: row.source_provider,
              raw_title: row.raw_title,
              raw_artist: row.raw_artist,
              raw_artwork_url: row.raw_artwork_url,
              caption: row.caption,
              created_at: row.created_at,
            }),
          )
          .execute()
        jamUris.push({ uri, did: a.did })
      }
    }

    // A few likes so counts aren't all zero (liker = a different seeded author).
    let likes = 0
    for (let k = 0; k < jamUris.length; k++) {
      const jam = jamUris[k]!
      for (let m = 1; m <= 2; m++) {
        const liker = authors[(k + m * 2 + 1) % authors.length]!
        if (liker.did === jam.did) continue
        const uri = `at://${liker.did}/fm.onrepeat.like/seedlike-${k}-${m}`
        await db
          .insertInto('likes')
          .values({
            uri,
            author_did: liker.did,
            subject_uri: jam.uri,
            created_at: new Date(now - k * HOUR),
          })
          .onConflict((oc) => oc.column('uri').doNothing())
          .execute()
        likes++
      }
    }

    console.log(
      `[seed] done: ${authors.length} authors, ${jamUris.length} jams, ${likes} likes.`,
    )
    console.log('[seed] view at http://127.0.0.1:3000/explore')
  } finally {
    await db.destroy()
  }
}

main().catch((err) => {
  console.error('[seed] failed:', err)
  process.exit(1)
})
