export interface RunWithDeadLetterOpts {
  /** The work (already wrapped in withRetry). */
  run: () => Promise<void>
  /** Durably record the failed event for later replay. Receives the failure cause. */
  deadLetter: (err: unknown) => Promise<void>
  /** Last resort when we can't even dead-letter (e.g. the DB is down). */
  onFatal: (err: Error) => void
  /** Human-readable identifier for logs/escalation (e.g. "create at://…"). */
  label: string
}

/**
 * Run an ingest handler with a dead-letter safety net.
 *
 * @atproto/sync advances the firehose cursor as soon as the handler returns — even when it
 * threw — so a record that exhausts its retries would otherwise be *silently lost* (and never
 * re-delivered on restart). On failure we capture it durably for replay. If even that write
 * fails (the DB itself is down), we escalate via `onFatal` rather than let the cursor march
 * past an unrecorded event: crashing lets the process resume from the last persisted cursor,
 * re-delivering recent events (indexing is idempotent).
 */
export async function runWithDeadLetter(
  opts: RunWithDeadLetterOpts,
): Promise<void> {
  try {
    await opts.run()
  } catch (err) {
    try {
      await opts.deadLetter(err)
    } catch (dlErr) {
      opts.onFatal(
        new Error(
          `could not dead-letter ${opts.label}: ${dlErr instanceof Error ? dlErr.message : String(dlErr)}`,
        ),
      )
    }
  }
}
