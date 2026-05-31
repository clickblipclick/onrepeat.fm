import { createDb, type DB } from '@onrepeat/db'

const databaseUrl = process.env.DATABASE_URL
if (!databaseUrl) throw new Error('DATABASE_URL must be set')

// Read-path Kysely pool. Intentionally separate from lib/oauth-client.ts's private
// pool (different lifetime/usage); do not merge them. Singleton across dev hot reloads.
const globalForDb = globalThis as unknown as { __onrepeatDb?: DB }
export const db: DB = globalForDb.__onrepeatDb ?? createDb(databaseUrl)
if (process.env.NODE_ENV !== 'production') globalForDb.__onrepeatDb = db
