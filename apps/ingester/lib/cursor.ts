import type { DB } from '@onrepeat/db'

export async function loadCursor(
  db: DB,
  service: string,
): Promise<number | undefined> {
  const row = await db
    .selectFrom('subscription_state')
    .select('cursor')
    .where('service', '=', service)
    .executeTakeFirst()
  // seq stays well below Number.MAX_SAFE_INTEGER at current relay scale; coerce bigint string → number.
  return row ? Number(row.cursor) : undefined
}

export async function saveCursor(
  db: DB,
  service: string,
  cursor: number,
): Promise<void> {
  await db
    .insertInto('subscription_state')
    .values({ service, cursor })
    .onConflict((oc) =>
      // Refresh updated_at on every advance so it reflects last progress, not insert time.
      oc.column('service').doUpdateSet({ cursor, updated_at: new Date() }),
    )
    .execute()
}

export interface CursorWriter {
  /** Remember the latest seq; persist if the throttle interval has elapsed. */
  record(seq: number): void
  /** Force-persist the latest recorded seq (call on shutdown). */
  flush(): Promise<void>
}

/**
 * Throttles cursor persistence: writes at most once per intervalMs, always
 * remembering the latest seq. `write` and `now` are injected for testability.
 */
export function makeThrottledCursorWriter(
  write: (seq: number) => Promise<void>,
  intervalMs: number,
  now: () => number = () => Date.now(),
): CursorWriter {
  let latest: number | undefined
  let lastWrite = Number.NEGATIVE_INFINITY
  return {
    record(seq: number) {
      latest = seq
      const ts = now()
      if (ts - lastWrite >= intervalMs) {
        lastWrite = ts
        void write(seq).catch((e) =>
          console.error('[ingester] cursor save failed', e),
        )
      }
    },
    async flush() {
      if (latest !== undefined) await write(latest)
    },
  }
}
