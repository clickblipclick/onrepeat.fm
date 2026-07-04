import { cookies } from 'next/headers'

import {
  MODE_PREF_COOKIE,
  parseMode,
  type PinnedMode,
} from './mode-preference'

/** Read the pinned display mode from the request cookies (Server Components only).
 *  null = no/invalid cookie = follow the system. */
export async function readModePreference(): Promise<PinnedMode | null> {
  const jar = await cookies()
  return parseMode(jar.get(MODE_PREF_COOKIE)?.value)
}
