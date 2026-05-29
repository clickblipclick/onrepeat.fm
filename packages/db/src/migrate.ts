import { Migrator, type Kysely, type Migration } from 'kysely'
import * as init001 from './migrations/001_init'
import * as oauth002 from './migrations/002_oauth'

const migrations: Record<string, Migration> = {
  '001_init': init001,
  '002_oauth': oauth002,
}

export function createMigrator(db: Kysely<any>): Migrator {
  return new Migrator({
    db,
    provider: {
      async getMigrations() {
        return migrations
      },
    },
  })
}
