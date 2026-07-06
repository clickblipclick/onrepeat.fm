/** Cap on scraped HTML we'll buffer — provider track pages are a few hundred KB at most. */
export const MAX_HTML_BYTES = 1024 * 1024

/** Read a `<meta property|name="key" content="...">` value, tolerating attribute order. */
export function metaContent(html: string, key: string): string | null {
  const k = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const m =
    new RegExp(
      `<meta[^>]+(?:property|name)="${k}"[^>]+content="([^"]*)"`,
      'i',
    ).exec(html) ??
    new RegExp(
      `<meta[^>]+content="([^"]*)"[^>]+(?:property|name)="${k}"`,
      'i',
    ).exec(html)
  return m ? m[1]! : null
}

/** Decode the handful of HTML entities providers emit in their meta tags. */
export function decodeEntities(s: string): string {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&#x27;|&apos;/gi, "'")
    .replace(/&amp;/g, '&')
}
