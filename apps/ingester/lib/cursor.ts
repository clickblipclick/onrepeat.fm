import type { DB } from '@onrepeat/db'

export interface CursorState {
  cursor: number
  /** When the cursor last advanced — i.e. how stale a resumed subscription is. */
  updatedAt: Date
}

export async function loadCursorState(
  db: DB,
  service: string,
): Promise<CursorState | undefined> {
  const row = await db
    .selectFrom('subscription_state')
    .select(['cursor', 'updated_at'])
    .where('service', '=', service)
    .executeTakeFirst()
  if (!row) return undefined
  // seq stays well below Number.MAX_SAFE_INTEGER at current relay scale; coerce bigint string → number.
  return {
    cursor: Number(row.cursor),
    updatedAt: new Date(row.updated_at as unknown as string | Date),
  }
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
      oc
        .column('service')
        .doUpdateSet({ cursor, updated_at: new Date() })
        // Monotonic guard: record() fire-and-forgets throttled writes, so an
        // in-flight one can land after flush()'s final write — never let an
        // older seq regress the persisted cursor.
        .where('subscription_state.cursor', '<', String(cursor)),
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
