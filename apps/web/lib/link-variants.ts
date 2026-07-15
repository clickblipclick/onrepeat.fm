/** Inline prose links: accent-colored and always underlined (offset keeps the line clear
 *  of descenders). The hover cue is a mode-aware accent shade — darker in light mode,
 *  lighter in dark (--accent-hover, set alongside --accent in globals.css). Neutral/muted
 *  interactive text keeps `hover:text-accent`. */
export const linkInline =
  'text-accent underline underline-offset-2 hover:text-accent-hover'
