import { Migrator, type Kysely, type Migration } from 'kysely'
import * as init001 from './migrations/001_init'

const migrations: Record<string, Migration> = {
  '001_init': init001,
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
