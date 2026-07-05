import { readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

import { migrations } from './migrate'

describe('migration registry', () => {
  it('registers every file in migrations/', () => {
    // The registry in migrate.ts is maintained by hand; a migration file that never
    // gets registered fails silently (it just never runs). Diff the directory
    // against the registry so the omission fails loudly here instead.
    const dir = fileURLToPath(new URL('./migrations', import.meta.url))
    const files = readdirSync(dir)
      .filter((f) => f.endsWith('.ts'))
      .map((f) => f.replace(/\.ts$/, ''))
      .sort()
    expect(Object.keys(migrations).sort()).toEqual(files)
  })
})
