/** Shared lifecycle helpers for the long-running service processes (ingester, resolver). */

/** Read a required env var, throwing a clear error if it's unset or empty. */
export function requireEnv(name: string): string {
  const v = process.env[name]
  if (!v) throw new Error(`missing required env ${name}`)
  return v
}

/** Grace period before shutdown stops waiting on cleanup and force-exits: long enough
 *  for a graceful pg-boss stop + pool drain, short enough to beat a supervisor's KILL. */
const SHUTDOWN_TIMEOUT_MS = 30_000

/**
 * Build the signal handler behind {@link onShutdown}. Exported so tests can drive
 * it directly instead of emitting real SIGINT/SIGTERM events at the test runner.
 */
export function createShutdownHandler(
  name: string,
  cleanup: () => Promise<void>,
  timeoutMs: number = SHUTDOWN_TIMEOUT_MS,
): (signal: string) => Promise<void> {
  let shuttingDown = false
  return async (signal: string): Promise<void> => {
    if (shuttingDown) {
      // A repeat signal is the operator (or supervisor) escalating — exit now
      // rather than wait out a wedged cleanup.
      console.error(
        `[${name}] received ${signal} during shutdown, exiting immediately`,
      )
      process.exit(1)
      return // reached only in tests, where process.exit is stubbed
    }
    shuttingDown = true
    console.log(`[${name}] received ${signal}, shutting down`)
    // A cleanup that never settles (hung pool drain, wedged socket close) must not
    // leave the process killable only by SIGKILL. unref: never delays a clean exit.
    setTimeout(() => {
      console.error(
        `[${name}] cleanup still running after ${timeoutMs}ms, forcing exit`,
      )
      process.exit(1)
    }, timeoutMs).unref()
    try {
      await cleanup()
    } catch (err) {
      console.error(`[${name}] error during shutdown`, err)
      process.exit(1)
      return // reached only in tests, where process.exit is stubbed
    }
    process.exit(0)
  }
}

/**
 * Run `cleanup` once on the first SIGINT/SIGTERM, then exit: 0 on clean teardown,
 * 1 if `cleanup` throws. Shutdown cannot hang the process: cleanup gets `timeoutMs`
 * (default 30s) before a forced exit 1, and a second signal while a shutdown is in
 * flight exits 1 immediately. `name` is only used to tag the log lines (e.g. "ingester").
 */
export function onShutdown(
  name: string,
  cleanup: () => Promise<void>,
  timeoutMs?: number,
): void {
  const handle = createShutdownHandler(name, cleanup, timeoutMs)
  process.on('SIGINT', () => void handle('SIGINT'))
  process.on('SIGTERM', () => void handle('SIGTERM'))
}
