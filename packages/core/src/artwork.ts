/**
 * Cover-art CDN hosts we'll fetch server-side. `artworkUrl` on a jam record is
 * attacker-controlled — anyone can write a `fm.onrepeat.jam` to their own PDS, and the
 * lexicon only checks `format: uri`, which permits `http://169.254.169.254/…`,
 * `http://localhost/…`, etc. Anything that fetches it server-side (the OG-image route)
 * must therefore allowlist the host, or it becomes an SSRF. These are the CDNs our own
 * resolvers emit artwork from: iTunes/Apple (mzstatic), Spotify (scdn), Bandcamp
 * (bcbits), YouTube (ytimg), SoundCloud (sndcdn).
 */
const ARTWORK_CDN_HOSTS = [
  'mzstatic.com',
  'scdn.co',
  'bcbits.com',
  'ytimg.com',
  'sndcdn.com',
]

/**
 * True iff `raw` is an https URL on a known cover-art CDN. Use before fetching an
 * untrusted `artworkUrl` server-side (e.g. when rendering an OG image); fall back to a
 * brand placeholder when it returns false.
 */
export function isTrustedArtworkUrl(
  raw: string | null | undefined,
  extraHosts: string[] = [],
): boolean {
  if (!raw) return false
  let u: URL
  try {
    u = new URL(raw)
  } catch {
    return false
  }
  if (u.protocol !== 'https:') return false
  const host = u.hostname.toLowerCase()
  const hosts = [
    ...ARTWORK_CDN_HOSTS,
    ...extraHosts.map((h) => h.toLowerCase()),
  ]
  // exact host or a dot-anchored subdomain (so "evil-scdn.co" does not match "scdn.co")
  return hosts.some((domain) => host === domain || host.endsWith('.' + domain))
}
