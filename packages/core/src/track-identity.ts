export interface TrackIdentityInput {
  isrc?: string | null
  odesliId?: string | null
  title?: string | null
  artist?: string | null
}

function normalizeText(s: string): string {
  return (
    s
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '') // strip combining diacritics
      .toLowerCase()
      // Drop decorations so identity matches @onrepeat/music's normalizeTokens — otherwise
      // "Bohemian Rhapsody (Official Video Remastered)" dedupes apart from "Bohemian Rhapsody".
      .replace(/\([^)]*\)|\[[^\]]*\]/g, ' ') // (parentheticals) / [brackets]
      .replace(/\b(feat|ft|featuring)\b.*$/g, ' ') // featured-artist tails
      .replace(/[^a-z0-9]+/g, ' ')
      .trim()
      .replace(/\s+/g, ' ')
  )
}

function normalizeIsrc(isrc: string): string {
  return isrc.replace(/[^a-zA-Z0-9]/g, '').toUpperCase()
}

/** Stable dedup key for a track. */
export function trackIdentity(input: TrackIdentityInput): string {
  if (input.isrc && input.isrc.trim())
    return `isrc:${normalizeIsrc(input.isrc)}`
  if (input.odesliId && input.odesliId.trim())
    return `odesli:${input.odesliId.trim()}`
  const title = normalizeText(input.title ?? '')
  const artist = normalizeText(input.artist ?? '')
  if (!title && !artist) {
    throw new Error(
      'trackIdentity: requires at least one of isrc, odesliId, title, or artist',
    )
  }
  return `ta:${artist}|${title}`
}
