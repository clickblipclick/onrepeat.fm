import { loadActorThemes } from '@onrepeat/appview'
import {
  resolveTheme,
  defaultThemeForDid,
  FALLBACK_THEME,
  type ThemeName,
} from '@onrepeat/core'
import { getSession } from './session'
import { db } from './db'

/**
 * The signed-in user's resolved color theme — used by the settings page to highlight
 * their current choice. (The app chrome itself is neutral `mono`; color themes apply
 * only on profile pages and jam cards.) Logged-out / DID-less contexts get the
 * FALLBACK_THEME; a logged-in user who hasn't picked one gets their deterministic
 * default (the "random on join" behavior). Best-effort: a DB hiccup falls back.
 */
export async function readViewerTheme(): Promise<ThemeName> {
  const { did } = await getSession()
  if (!did) return FALLBACK_THEME
  try {
    const themes = await loadActorThemes(db, [did])
    return resolveTheme(themes.get(did), did)
  } catch {
    return defaultThemeForDid(did)
  }
}
