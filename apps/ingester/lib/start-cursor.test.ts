import { describe, expect, it } from 'vitest'

import {
  jetstreamServiceKey,
  parseStartCursorOverride,
  resolveStartCursor,
  TIMESTAMP_CURSOR_MIN,
  timestampCursor,
  type CursorRow,
} from './start-cursor'

const HOST_KEY = 'jetstream:jetstream.us-west.bsky.network'
const T = Date.parse('2026-10-17T12:00:00.000Z')
const row = (
  service: string,
  cursor: number,
  updatedAt: number,
): CursorRow => ({
  service,
  cursor,
  updatedAt: new Date(updatedAt),
})

describe('jetstreamServiceKey', () => {
  it('keys by host', () => {
    expect(jetstreamServiceKey('https://jetstream.us-west.bsky.network')).toBe(
      HOST_KEY,
    )
    expect(jetstreamServiceKey('https://jetstream.us-east.bsky.network/')).toBe(
      'jetstream:jetstream.us-east.bsky.network',
    )
  })
})

describe('timestampCursor', () => {
  it('converts to unix microseconds with the 60s margin', () => {
    expect(timestampCursor(new Date(T))).toBe((T - 60_000) * 1000)
    expect(timestampCursor(new Date(T), 0)).toBe(T * 1000)
    expect(timestampCursor(new Date(T))).toBeGreaterThanOrEqual(
      TIMESTAMP_CURSOR_MIN,
    )
  })

  it('refuses to build a timestamp cursor below the 1e15 threshold', () => {
    expect(() => timestampCursor(new Date('2000-01-01T00:00:00Z'))).toThrow(
      RangeError,
    )
  })
})

describe('parseStartCursorOverride', () => {
  it('returns undefined for unset or empty', () => {
    expect(parseStartCursorOverride(undefined)).toBeUndefined()
    expect(parseStartCursorOverride('')).toBeUndefined()
    expect(parseStartCursorOverride('  ')).toBeUndefined()
  })

  it('parses a seq and a timestamp', () => {
    expect(parseStartCursorOverride('24664288881')).toBe(24664288881)
    expect(parseStartCursorOverride('1792000000000000')).toBe(1792000000000000)
  })

  it('rejects non-integers', () => {
    for (const bad of ['abc', '1.5', '-1', '1e3', 'NaN']) {
      expect(() => parseStartCursorOverride(bad), bad).toThrow(
        /INGESTER_START_CURSOR/,
      )
    }
  })

  it('rejects a millisecond timestamp with a unit hint', () => {
    // 13 digits is a pasted Date.now(): far above any plausible seq and far
    // below the 1e15 microsecond threshold, so it would be sent as a seq.
    expect(() => parseStartCursorOverride('1792195200123')).toThrow(
      /millisecond/,
    )
    expect(() => parseStartCursorOverride('1000000000000')).toThrow(
      /millisecond/,
    )
  })

  it('accepts seqs below the implausible band and timestamps at or above 1e15', () => {
    expect(parseStartCursorOverride('999999999999')).toBe(999_999_999_999)
    expect(parseStartCursorOverride('1000000000000000')).toBe(1e15)
  })
})

describe('resolveStartCursor', () => {
  const base = { liveTail: false, serviceKey: HOST_KEY, now: T }

  it('override wins over everything', () => {
    expect(
      resolveStartCursor({
        ...base,
        liveTail: true,
        override: 5,
        rows: [row(HOST_KEY, 42, T)],
      }),
    ).toEqual({ cursor: 5, source: 'override' })
  })

  it('live tail ignores stored rows', () => {
    expect(
      resolveStartCursor({
        ...base,
        liveTail: true,
        rows: [row(HOST_KEY, 42, T)],
      }),
    ).toEqual({ source: 'live-tail' })
  })

  it('no rows → live head', () => {
    expect(resolveStartCursor({ ...base, rows: [] })).toEqual({
      source: 'none',
    })
  })

  it('resumes from the same-host seq when it is the freshest row', () => {
    const r = row(HOST_KEY, 42, T - 1000)
    expect(
      resolveStartCursor({ ...base, rows: [row('firehose', 9, T - 5000), r] }),
    ).toEqual({ cursor: 42, source: 'same-host-seq', from: r, staleMs: 1000 })
  })

  it('cuts over from the firehose row on first deploy', () => {
    const r = row('firehose', 34383886318, T - 10_000)
    expect(resolveStartCursor({ ...base, rows: [r] })).toEqual({
      cursor: (T - 10_000 - 60_000) * 1000,
      source: 'cutover',
      from: r,
      staleMs: 10_000,
    })
  })

  it('prefers a fresher foreign row over a stale same-host row', () => {
    const fresh = row('firehose', 9, T - 1000)
    expect(
      resolveStartCursor({
        ...base,
        rows: [row(HOST_KEY, 42, T - 3_600_000), fresh],
      }),
    ).toMatchObject({
      source: 'cutover',
      from: fresh,
      cursor: (T - 1000 - 60_000) * 1000,
    })
  })

  it('cuts over from another host row after a URL change', () => {
    const other = row('jetstream:jetstream.us-east.bsky.network', 77, T - 2000)
    expect(resolveStartCursor({ ...base, rows: [other] })).toMatchObject({
      source: 'cutover',
      from: other,
    })
  })

  it('on an exact updated_at tie the same-host row wins', () => {
    const same = row(HOST_KEY, 42, T)
    expect(
      resolveStartCursor({ ...base, rows: [row('firehose', 9, T), same] }),
    ).toMatchObject({ source: 'same-host-seq', cursor: 42 })
  })

  it('honours a custom margin', () => {
    expect(
      resolveStartCursor({
        ...base,
        rows: [row('firehose', 1, T)],
        marginMs: 0,
      }).cursor,
    ).toBe(T * 1000)
  })
})
