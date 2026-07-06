import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type MockInstance,
} from 'vitest'

import { createShutdownHandler, onShutdown, requireEnv } from './index'

describe('requireEnv', () => {
  afterEach(() => {
    delete process.env.TEST_REQUIRE_ENV
  })

  it('returns the value when set', () => {
    process.env.TEST_REQUIRE_ENV = 'x'
    expect(requireEnv('TEST_REQUIRE_ENV')).toBe('x')
  })

  it('throws (naming the var) when unset', () => {
    expect(() => requireEnv('TEST_REQUIRE_ENV')).toThrow(/TEST_REQUIRE_ENV/)
  })

  it('treats an empty string as missing', () => {
    process.env.TEST_REQUIRE_ENV = ''
    expect(() => requireEnv('TEST_REQUIRE_ENV')).toThrow(/TEST_REQUIRE_ENV/)
  })
})

describe('createShutdownHandler', () => {
  let exit: MockInstance

  beforeEach(() => {
    exit = vi
      .spyOn(process, 'exit')
      .mockImplementation((() => undefined) as never)
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  it('runs cleanup once and exits 0 on clean teardown', async () => {
    const cleanup = vi.fn(async () => {})
    const handle = createShutdownHandler('t', cleanup)
    await handle('SIGTERM')
    expect(cleanup).toHaveBeenCalledTimes(1)
    expect(exit).toHaveBeenCalledWith(0)
  })

  it('exits 1 when cleanup throws', async () => {
    const handle = createShutdownHandler('t', async () => {
      throw new Error('boom')
    })
    await handle('SIGTERM')
    expect(exit).toHaveBeenCalledWith(1)
    expect(exit).not.toHaveBeenCalledWith(0)
  })

  it('a second signal during cleanup exits 1 immediately without re-running cleanup', async () => {
    let release!: () => void
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const cleanup = vi.fn(() => gate)
    const handle = createShutdownHandler('t', cleanup)
    const first = handle('SIGTERM')
    await handle('SIGINT') // operator escalation while cleanup is in flight
    expect(exit).toHaveBeenCalledWith(1)
    expect(cleanup).toHaveBeenCalledTimes(1)
    release()
    await first
  })

  it('force-exits 1 when cleanup exceeds the timeout', async () => {
    vi.useFakeTimers()
    const handle = createShutdownHandler(
      't',
      () => new Promise<void>(() => {}), // never settles
      30_000,
    )
    void handle('SIGTERM')
    await vi.advanceTimersByTimeAsync(29_999)
    expect(exit).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    expect(exit).toHaveBeenCalledWith(1)
  })
})

describe('onShutdown', () => {
  it('registers one listener each for SIGINT and SIGTERM', () => {
    const before = {
      int: process.listeners('SIGINT'),
      term: process.listeners('SIGTERM'),
    }
    onShutdown('t', async () => {})
    const added = {
      int: process.listeners('SIGINT').filter((l) => !before.int.includes(l)),
      term: process
        .listeners('SIGTERM')
        .filter((l) => !before.term.includes(l)),
    }
    expect(added.int).toHaveLength(1)
    expect(added.term).toHaveLength(1)
    // Remove them so a real Ctrl-C to the test runner can't hit our handler.
    for (const l of added.int) process.removeListener('SIGINT', l)
    for (const l of added.term) process.removeListener('SIGTERM', l)
  })
})
