/** Shared lifecycle helpers for the long-running service processes (ingester, resolver). */

/** Read a required env var, throwing a clear error if it's unset or empty. */
export function requireEnv(name: string): string {
  const v = process.env[name]
  if (!v) throw new Error(`missing required env ${name}`)
  return v
}

/**
 * Run `cleanup` once on the first SIGINT/SIGTERM, then exit. Repeated signals while a
 * shutdown is already in flight are ignored. Exits 0 on clean teardown, 1 if `cleanup`
 * throws. `name` is only used to tag the log lines (e.g. "ingester").
 */
export function onShutdown(name: string, cleanup: () => Promise<void>): void {
  let shuttingDown = false
  const handle = async (signal: string): Promise<void> => {
    if (shuttingDown) return
    shuttingDown = true
    console.log(`[${name}] received ${signal}, shutting down`)
    try {
      await cleanup()
    } catch (err) {
      console.error(`[${name}] error during shutdown`, err)
      process.exit(1)
    }
    process.exit(0)
  }
  process.on('SIGINT', () => void handle('SIGINT'))
  process.on('SIGTERM', () => void handle('SIGTERM'))
}
