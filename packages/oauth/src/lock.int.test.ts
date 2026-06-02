import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createDb } from '@onrepeat/db'
import { createPgAdvisoryLock } from './lock'

const url =
  process.env.DATABASE_URL ??
  'postgres://onrepeat:onrepeat@localhost:5432/onrepeat_test'

// Advisory locks use no tables, so no migration/schema reset is needed — just a
// live connection pool (createDb defaults to pg's max:10, so concurrent calls
// genuinely contend on the lock rather than on a single connection).
const db = createDb(url)

function deferred<T = void>() {
  let resolve!: (v: T) => void
  const promise = new Promise<T>((r) => {
    resolve = r
  })
  return { promise, resolve }
}

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms))

describe('createPgAdvisoryLock', () => {
  afterAll(async () => {
    await db.destroy()
  })

  it('serializes calls with the same name (second waits for the first to release)', async () => {
    const lock = createPgAdvisoryLock(db)
    const order: string[] = []
    const acquired1 = deferred()
    const proceed1 = deferred()

    const p1 = lock('same-name', async () => {
      acquired1.resolve()
      order.push('a-start')
      await proceed1.promise
      order.push('a-end')
    })

    // Once p1's fn runs, p1 holds the lock.
    await acquired1.promise

    let p2done = false
    const p2 = lock('same-name', async () => {
      p2done = true
      order.push('b')
    })

    // While p1 holds the lock, p2 cannot acquire it — it must not run.
    await delay(100)
    expect(p2done).toBe(false)
    expect(order).toEqual(['a-start'])

    proceed1.resolve()
    await Promise.all([p1, p2])
    expect(order).toEqual(['a-start', 'a-end', 'b'])
  })

  it('allows concurrent calls with different names', async () => {
    const lock = createPgAdvisoryLock(db)
    const acquired1 = deferred()
    const proceed1 = deferred()

    const p1 = lock('name-x', async () => {
      acquired1.resolve()
      await proceed1.promise
    })
    await acquired1.promise

    // A different name must NOT be blocked by the lock held above; if it were,
    // this await would hang and the test would time out.
    let yRan = false
    await lock('name-y', async () => {
      yRan = true
    })
    expect(yRan).toBe(true)

    proceed1.resolve()
    await p1
  })

  it('releases the lock when fn throws', async () => {
    const lock = createPgAdvisoryLock(db)
    await expect(
      lock('boom', async () => {
        throw new Error('kaboom')
      }),
    ).rejects.toThrow('kaboom')

    // The lock must have been released despite the throw, so a re-acquire works.
    let ran = false
    await lock('boom', async () => {
      ran = true
    })
    expect(ran).toBe(true)
  })

  it('returns the value produced by fn', async () => {
    const lock = createPgAdvisoryLock(db)
    const result = await lock('val', async () => 42)
    expect(result).toBe(42)
  })
})
