import { describe, it, expect } from 'vitest'
import { createPool } from './client'

// Pools are lazy (no connection until first acquire), so these assert configuration
// without needing a live Postgres.
describe('createPool', () => {
  it('attaches an idle-client error handler so a backend blip cannot crash the process', async () => {
    const pool = createPool('postgres://u:p@127.0.0.1:5999/none')
    try {
      // Without a listener, node-postgres re-emits an idle client error as an
      // unhandled 'error' event and Node exits the process.
      expect(pool.listenerCount('error')).toBeGreaterThan(0)
    } finally {
      await pool.end()
    }
  })

  it('sets a finite connection timeout instead of waiting forever', async () => {
    const pool = createPool('postgres://u:p@127.0.0.1:5999/none')
    try {
      expect(pool.options.connectionTimeoutMillis).toBeGreaterThan(0)
    } finally {
      await pool.end()
    }
  })

  it('lets callers override pool config', async () => {
    const pool = createPool('postgres://u:p@127.0.0.1:5999/none', { max: 3 })
    try {
      expect(pool.options.max).toBe(3)
    } finally {
      await pool.end()
    }
  })
})
