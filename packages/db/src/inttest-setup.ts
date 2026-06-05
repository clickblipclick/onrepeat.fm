// Vitest setupFile for the integration suite (wired in vitest.int.config.ts).
//
// Integration tests TRUNCATE tables, so they must never run against the dev/app
// database (onrepeat_test). This runs before each int test file is imported, so the
// files' top-level `process.env.DATABASE_URL ?? <default>` pick up the value set here.
// The dedicated DB is DATABASE_URL_INTTEST (default: onrepeat_inttest), independent of
// any ambient DATABASE_URL (which usually points at dev).
const DEFAULT_INTTEST_DB = 'postgres://onrepeat:onrepeat@localhost:5432/onrepeat_inttest'

const url = process.env.DATABASE_URL_INTTEST ?? DEFAULT_INTTEST_DB
let name = ''
try {
  name = new URL(url).pathname.replace(/^\//, '')
} catch {
  /* invalid url → caught by the guard below */
}

if (!name || name === 'onrepeat_test' || !/^[a-zA-Z0-9_]+$/.test(name)) {
  throw new Error(
    `[inttest] refusing to run integration tests against '${name || url}': they truncate tables. ` +
      `Use a dedicated database via DATABASE_URL_INTTEST (default: ${DEFAULT_INTTEST_DB}).`,
  )
}

process.env.DATABASE_URL = url
