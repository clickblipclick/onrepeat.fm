import { describe, it, expect } from 'vitest'
import { buttonClassName } from './button-variants'

describe('buttonClassName', () => {
  it('defaults to the primary variant at md size', () => {
    const c = buttonClassName()
    expect(c).toContain('bg-accent')
    expect(c).toContain('text-on-accent')
    expect(c).toContain('py-2') // md padding
  })

  it('applies the danger variant', () => {
    expect(buttonClassName({ variant: 'danger' })).toContain('bg-red-600')
  })

  it('applies the secondary variant (bordered surface)', () => {
    const c = buttonClassName({ variant: 'secondary' })
    expect(c).toContain('border-border')
    expect(c).toContain('bg-surface')
  })

  it('outline variant fills with accent on hover', () => {
    const cls = buttonClassName({ variant: 'outline' })
    expect(cls).toContain('border-ink')
    expect(cls).toContain('hover:bg-accent')
    expect(cls).toContain('hover:text-on-accent')
  })

  it('applies the ghost variant (transparent)', () => {
    expect(buttonClassName({ variant: 'ghost' })).toContain('bg-transparent')
  })

  it('applies the sm size', () => {
    expect(buttonClassName({ size: 'sm' })).toContain('text-xs')
  })

  it('appends a custom className last so callers can override', () => {
    expect(buttonClassName({ className: 'w-full' })).toMatch(/ w-full$/)
  })
})
