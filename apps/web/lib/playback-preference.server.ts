import { cookies } from 'next/headers'

import {
  parseProvider,
  PLAYBACK_PREF_COOKIE,
  type PlaybackProvider,
} from './playback-preference'

/** Read the preferred playback provider from the request cookies (Server Components only). */
export async function readPreferredProvider(): Promise<PlaybackProvider | null> {
  const jar = await cookies()
  return parseProvider(jar.get(PLAYBACK_PREF_COOKIE)?.value)
}
