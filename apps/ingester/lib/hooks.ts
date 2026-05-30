import type { IngestEvent } from './events'

/** Extension points the ingester calls. */
export interface IngesterHooks {
  /**
   * Fires after a jam is indexed — on create AND update. May fire more than once
   * for the same jam: the firehose can redeliver events after a restart, and a user
   * editing a jam produces an update. Downstream handlers MUST be idempotent.
   * Plan 4 wires this to the resolve queue, which dedups by track identity.
   */
  onJamIndexed: (evt: IngestEvent) => void | Promise<void>
}

export const defaultHooks: IngesterHooks = {
  onJamIndexed: async () => {},
}
