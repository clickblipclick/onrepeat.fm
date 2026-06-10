import { describe, it, expect } from 'vitest'
import { inputClassName } from './input-variants'

describe('inputClassName', () => {
  it('includes the base field styling + focus ring', () => {
    const c = inputClassName()
    expect(c).toContain('border-border')
    expect(c).toContain('bg-surface')
    expect(c).toContain('focus-visible:ring-accent')
  })

  it('uses a 16px font so iOS Safari does not zoom on focus', () => {
    const c = inputClassName()
    expect(c).toContain('text-base')
    expect(c).not.toContain('text-sm')
  })

  it('does NOT bake in a width (caller controls w-full vs flex-1)', () => {
    expect(inputClassName()).not.toContain('w-full')
  })

  it('appends a custom className last so callers can override', () => {
    expect(inputClassName('flex-1')).toMatch(/ flex-1$/)
  })
})
