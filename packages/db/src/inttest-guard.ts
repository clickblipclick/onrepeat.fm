// Safety guard shared by the integration-test setup (inttest-setup.ts) and DB bootstrap
// (inttest-create.ts). The integration suite TRUNCATEs / drops the schema, so it must only
// ever point at a throwaway local database that's explicitly opted in.

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', ''])

/** The dev/app database — never a valid integration target. */
const APP_DB = 'onrepeat_test'

/**
 * Validate that `url` is safe for the table-truncating integration suite, returning the
 * database name. Throws otherwise. Requires: a parseable URL, a LOCAL host (not a remote/
 * prod box), a sane db name that isn't the dev/app DB, and an explicit `_inttest` suffix so
 * a database can't be truncated unless it was deliberately named for integration testing.
 */
export function assertInttestUrl(url: string): string {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    throw new Error(`[inttest] invalid DATABASE_URL_INTTEST: '${url}'`)
  }
  const name = parsed.pathname.replace(/^\//, '')
  const host = parsed.hostname
  const why = !name
    ? 'no database name'
    : name === APP_DB
      ? "it's the dev/app database"
      : !/^[a-zA-Z0-9_]+$/.test(name)
        ? 'the name has unexpected characters'
        : !/_inttest$/.test(name)
          ? "the name must end in '_inttest' to opt in"
          : !LOCAL_HOSTS.has(host)
            ? `the host '${host}' is not local`
            : null
  if (why) {
    throw new Error(
      `[inttest] refusing to run table-truncating integration tests against ` +
        `'${name || url}'${host ? ` (host ${host})` : ''}: ${why}. Use a local *_inttest ` +
        `database via DATABASE_URL_INTTEST (default: postgres://onrepeat:onrepeat@localhost:5432/onrepeat_inttest).`,
    )
  }
  return name
}
