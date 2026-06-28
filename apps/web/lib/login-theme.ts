import { THEMES, type ThemeName } from '@onrepeat/core'

/** Pick a random color theme for the login screen. `rand` (default Math.random) is
 *  injectable so tests stay deterministic. Always returns a valid THEMES member. */
export function pickLoginTheme(rand: () => number = Math.random): ThemeName {
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  return THEMES[Math.floor(rand() * THEMES.length)]!
}
