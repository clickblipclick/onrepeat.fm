import { execFileSync, spawn, type ChildProcess } from 'node:child_process'
import { generateKeyPairSync, randomBytes } from 'node:crypto'
import {
  closeSync,
  existsSync,
  mkdtempSync,
  openSync,
  readFileSync,
  rmSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { FullConfig } from '@playwright/test'

import { createDb, createMigrator, resolveInttestUrl } from '@onrepeat/db'

import { startFakeBsky } from './fake-bsky'
import { seedSmokeData } from './seed'

// Brings up everything the smoke tests talk to, in order:
//   1. the integration-test database (created if missing, migrated, reseeded),
//   2. a fake public AppView for handle → profile lookups (fake-bsky.ts),
//   3. a production `next start` of the already-built app, wired to both.
// What the tests need to know (seed, server log path) rides to the workers via env.

const ROOT = fileURLToPath(new URL('../../..', import.meta.url))
const WEB_DIR = resolve(ROOT, 'apps/web')
const READY_TIMEOUT_MS = 60_000

export default async function globalSetup(config: FullConfig) {
  const baseURL = config.projects[0]?.use.baseURL
  if (!baseURL) throw new Error('smoke: baseURL is not configured')
  const port = new URL(baseURL).port

  if (!existsSync(join(WEB_DIR, '.next/BUILD_ID'))) {
    throw new Error(
      'smoke: apps/web has no production build — run `pnpm --filter @onrepeat/web build` first (or `pnpm test:smoke`, which builds)',
    )
  }
  // The readiness poll below would happily accept whatever already answers on the
  // port (an orphaned server from an earlier run, say) and pass the suite against it.
  if (await isListening(baseURL)) {
    throw new Error(
      `smoke: something is already listening on ${baseURL} — stop it, or pick another port with SMOKE_PORT`,
    )
  }

  // 1. Database — the table-truncating *_inttest DB the integration suite also uses.
  const databaseUrl = resolveInttestUrl()
  execFileSync(
    'pnpm',
    ['--filter', '@onrepeat/db', 'exec', 'tsx', 'src/inttest-create.ts'],
    {
      cwd: ROOT,
      stdio: 'inherit',
      env: { ...process.env, DATABASE_URL_INTTEST: databaseUrl },
    },
  )
  const db = createDb(databaseUrl)
  const seed = await (async () => {
    try {
      const { error } = await createMigrator(db).migrateToLatest()
      if (error) throw error
      return await seedSmokeData(db)
    } finally {
      await db.destroy()
    }
  })()

  // 2. Fake AppView.
  const bsky = await startFakeBsky([
    { did: seed.did, handle: seed.handle, displayName: seed.displayName },
    {
      did: seed.liker.did,
      handle: seed.liker.handle,
      displayName: seed.liker.displayName,
    },
  ])

  // 3. The app. `next start` forces NODE_ENV=production, and the OAuth client refuses
  // dev/loopback OAuth there, so run it exactly like a deploy: prod OAuth mode with a
  // throwaway signing key and store key, and a non-loopback PUBLIC_URL. Nothing calls
  // out to that origin — it only shapes the client metadata and absolute links.
  const publicUrl = 'https://smoke.onrepeat.test'
  const { privateKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' })
  const signingKeyPem = privateKey.export({ type: 'pkcs8', format: 'pem' })

  const logDir = mkdtempSync(join(tmpdir(), 'onrepeat-smoke-'))
  const logPath = join(logDir, 'server.log')
  const logFd = openSync(logPath, 'w')
  // `next start` also auto-loads apps/web/.env.local, but never over keys set here, and
  // every key the app reads while logged out is set here — so local and CI runs match.
  const server = spawn(
    join(WEB_DIR, 'node_modules/.bin/next'),
    ['start', '-p', port, '-H', '127.0.0.1'],
    {
      cwd: WEB_DIR,
      stdio: ['ignore', logFd, logFd],
      env: {
        ...process.env,
        DATABASE_URL: databaseUrl,
        SESSION_SECRET: randomBytes(32).toString('base64'),
        PUBLIC_URL: publicUrl,
        OAUTH_MODE: 'prod',
        OAUTH_PRIVATE_KEYS: JSON.stringify([signingKeyPem]),
        OAUTH_STORE_KEY: randomBytes(32).toString('base64'),
        BSKY_PUBLIC_API_URL: bsky.url,
        NEXT_TELEMETRY_DISABLED: '1',
      },
    },
  )
  closeSync(logFd) // the child holds its own copy
  try {
    await waitForServer(server, `${baseURL}/privacy`, logPath)
  } catch (err) {
    server.kill('SIGKILL')
    await bsky.close()
    throw err
  }

  process.env.SMOKE_SEED = JSON.stringify(seed)
  process.env.SMOKE_SERVER_LOG = logPath
  process.env.SMOKE_PUBLIC_URL = publicUrl

  return async () => {
    await stop(server)
    await bsky.close()
    // The last test has already read (and, on failure, printed) the server log.
    rmSync(logDir, { recursive: true, force: true })
  }
}

async function isListening(url: string): Promise<boolean> {
  try {
    await fetch(url, { signal: AbortSignal.timeout(2_000) })
    return true
  } catch {
    return false
  }
}

async function waitForServer(
  server: ChildProcess,
  url: string,
  logPath: string,
): Promise<void> {
  const deadline = Date.now() + READY_TIMEOUT_MS
  let exited: string | null = null
  server.once('exit', (code, signal) => {
    exited = `exited (code ${code}, signal ${signal})`
  })
  server.once('error', (err) => {
    exited = `failed to start: ${err.message}`
  })
  while (Date.now() < deadline) {
    if (exited) break
    try {
      const res = await fetch(url)
      // Re-check after the round trip: a child that lost the port to another process
      // can exit while someone else answers.
      if (res.ok && !exited) return
    } catch {
      // not listening yet
    }
    await new Promise((r) => setTimeout(r, 250))
  }
  throw new Error(
    `smoke: next start ${exited ?? 'did not become ready in time'}; server output:\n${readFileSync(logPath, 'utf8')}`,
  )
}

function stop(server: ChildProcess): Promise<void> {
  return new Promise((done) => {
    if (server.exitCode !== null || server.signalCode !== null) return done()
    const force = setTimeout(() => server.kill('SIGKILL'), 5_000)
    server.once('exit', () => {
      clearTimeout(force)
      done()
    })
    server.kill('SIGTERM')
  })
}
