import { describe, expect, it } from 'vitest'

import { runWithDeadLetter } from './dead-letter'

describe('runWithDeadLetter', () => {
  it('runs the work and touches neither dead-letter nor fatal when it succeeds', async () => {
    let dead = 0
    let fatal = 0
    await runWithDeadLetter({
      run: async () => {},
      deadLetter: async () => {
        dead++
      },
      onFatal: () => {
        fatal++
      },
      label: 'x',
    })
    expect(dead).toBe(0)
    expect(fatal).toBe(0)
  })

  it('dead-letters (not fatal) when the work fails after retries, passing the error', async () => {
    let captured: unknown
    let fatal = 0
    await runWithDeadLetter({
      run: async () => {
        throw new Error('boom')
      },
      deadLetter: async (err) => {
        captured = err
      },
      onFatal: () => {
        fatal++
      },
      label: 'x',
    })
    expect((captured as Error).message).toBe('boom')
    expect(fatal).toBe(0)
  })

  it('escalates to onFatal when even dead-lettering fails (e.g. DB down)', async () => {
    let fatalErr: Error | undefined
    await runWithDeadLetter({
      run: async () => {
        throw new Error('boom')
      },
      deadLetter: async () => {
        throw new Error('db down')
      },
      onFatal: (err) => {
        fatalErr = err
      },
      label: 'jam-x',
    })
    expect(fatalErr).toBeInstanceOf(Error)
    expect(fatalErr!.message).toContain('jam-x') // identifies the lost event
    expect(fatalErr!.message).toContain('db down') // and the underlying cause
  })
})
