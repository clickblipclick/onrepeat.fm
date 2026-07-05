import type { Kysely } from 'kysely'
import { Migrator, type Migration } from 'kysely/migration'

import * as init001 from './migrations/001_init'
import * as oauth002 from './migrations/002_oauth'
import * as subscriptionState003 from './migrations/003_subscription_state'
import * as jamArtwork004 from './migrations/004_jam_artwork'
import * as failedEvents005 from './migrations/005_failed_events'
import * as actorTheme006 from './migrations/006_actor_theme'
import * as actorStatus007 from './migrations/007_actor_status'
import * as actorProfileCache008 from './migrations/008_actor_profile_cache'
import * as hotPathIndexes009 from './migrations/009_hot_path_indexes'
import * as trackCdnArtwork010 from './migrations/010_track_cdn_artwork'
import * as follows011 from './migrations/011_follows'
import * as notifications012 from './migrations/012_notifications'
import * as followNotifications013 from './migrations/013_follow_notifications'

const migrations: Record<string, Migration> = {
  '001_init': init001,
  '002_oauth': oauth002,
  '003_subscription_state': subscriptionState003,
  '004_jam_artwork': jamArtwork004,
  '005_failed_events': failedEvents005,
  '006_actor_theme': actorTheme006,
  '007_actor_status': actorStatus007,
  '008_actor_profile_cache': actorProfileCache008,
  '009_hot_path_indexes': hotPathIndexes009,
  '010_track_cdn_artwork': trackCdnArtwork010,
  '011_follows': follows011,
  '012_notifications': notifications012,
  '013_follow_notifications': followNotifications013,
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
