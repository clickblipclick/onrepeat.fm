import { Kysely, PostgresDialect } from 'kysely'
import pg from 'pg'
import type { Database } from './schema'

export type PoolConfig = Omit<pg.PoolConfig, 'connectionString'>

/**
 * A configured pg Pool. Two hardening defaults the bare `new Pool({connectionString})`
 * lacks: (1) an `'error'` listener — node-postgres re-emits errors from *idle* pooled
 * clients (backend restart, network drop) on the Pool, and with no listener Node treats
 * it as an unhandled 'error' and exits the process; (2) a finite `connectionTimeoutMillis`
 * so acquiring a client fails fast instead of hanging forever when the pool is exhausted
 * or Postgres is unreachable. Callers may override any field.
 */
export function createPool(
  connectionString: string,
  config: PoolConfig = {},
): pg.Pool {
  const pool = new pg.Pool({
    connectionString,
    connectionTimeoutMillis: 5000,
    ...config,
  })
  pool.on('error', (err) => {
    // The errored client is already removed from the pool; log and continue.
    console.error('[db] idle client error', err)
  })
  return pool
}

export function createDb(
  connectionString: string,
  config?: PoolConfig,
): Kysely<Database> {
  return new Kysely<Database>({
    dialect: new PostgresDialect({
      pool: createPool(connectionString, config),
    }),
  })
}

export type DB = Kysely<Database>
