import { describe, expect, it } from 'vitest'

import { createIngester } from './firehose'

describe('createIngester', () => {
  it('constructs without throwing and exposes start/stop', async () => {
    // liveTail skips loadCursorState, so construction never touches the db — a
    // dummy stands in. The relay is only dialed by start(), which we never call.
    const ingester = await createIngester({
      db: {} as never,
      relay: 'wss://example.invalid',
      liveTail: true,
    })
    expect(typeof ingester.start).toBe('function')
    expect(typeof ingester.stop).toBe('function')
  })
})
