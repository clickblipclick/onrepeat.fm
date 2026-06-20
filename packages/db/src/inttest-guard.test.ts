import { describe, expect, it } from 'vitest'

import { assertInttestUrl } from './inttest-guard'

describe('assertInttestUrl', () => {
  it('accepts a local *_inttest database and returns its name', () => {
    expect(
      assertInttestUrl(
        'postgres://onrepeat:onrepeat@localhost:5432/onrepeat_inttest',
      ),
    ).toBe('onrepeat_inttest')
    expect(
      assertInttestUrl('postgres://u:p@127.0.0.1:5432/onrepeat_inttest'),
    ).toBe('onrepeat_inttest')
  })

  it('refuses the dev/app database', () => {
    expect(() =>
      assertInttestUrl('postgres://u:p@localhost:5432/onrepeat_test'),
    ).toThrow(/onrepeat_test|dev\/app/)
  })

  it('refuses a non-local host even with an _inttest name', () => {
    expect(() =>
      assertInttestUrl(
        'postgres://u:p@db.prod.example.com:5432/onrepeat_inttest',
      ),
    ).toThrow(/not local|host/)
  })

  it('refuses a name without the _inttest opt-in suffix', () => {
    expect(() =>
      assertInttestUrl('postgres://u:p@localhost:5432/onrepeat'),
    ).toThrow(/_inttest/)
  })

  it('refuses an unparseable url', () => {
    expect(() => assertInttestUrl('not a url')).toThrow()
  })

  it('refuses a name with unexpected characters', () => {
    expect(() =>
      assertInttestUrl('postgres://u:p@localhost:5432/onrepeat-inttest;drop'),
    ).toThrow()
  })
})
