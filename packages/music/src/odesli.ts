import type { ProviderRefs } from '@onrepeat/db'

export interface OdesliResult {
  notFound: boolean
  title?: string
  artist?: string
  artworkUrl?: string
  providerRefs: ProviderRefs
}

export interface OdesliClient {
  resolve(sourceUrl: string): Promise<OdesliResult>
}

interface OdesliBody {
  entityUniqueId?: string
  pageUrl?: string
  entitiesByUniqueId?: Record<string, { title?: string; artistName?: string; thumbnailUrl?: string }>
  linksByPlatform?: Record<string, { url?: string }>
}

/** Pure: map an Odesli response to provider refs + canonical metadata. */
export function mapOdesli(body: OdesliBody): OdesliResult {
  const providerRefs: ProviderRefs = {}
  for (const [platform, link] of Object.entries(body.linksByPlatform ?? {})) {
    if (link?.url) providerRefs[platform.toLowerCase()] = { url: link.url }
  }
  if (body.pageUrl) providerRefs.songlink = { url: body.pageUrl }
  const entity = body.entityUniqueId ? body.entitiesByUniqueId?.[body.entityUniqueId] : undefined
  return {
    notFound: false,
    title: entity?.title,
    artist: entity?.artistName,
    artworkUrl: entity?.thumbnailUrl,
    providerRefs,
  }
}

type FetchLike = (url: string, init?: { signal?: AbortSignal }) => Promise<{ status: number; ok: boolean; json: () => Promise<unknown> }>

export interface OdesliClientOptions {
  fetchFn?: FetchLike
  throttle?: () => Promise<void>
  timeoutMs?: number
}

const ENDPOINT = 'https://api.song.link/v1-alpha.1/links'

export function createOdesliClient(opts: OdesliClientOptions = {}): OdesliClient {
  const fetchFn = (opts.fetchFn ?? (globalThis.fetch as unknown as FetchLike))
  const throttle = opts.throttle ?? (async () => {})
  const timeoutMs = opts.timeoutMs ?? 10_000
  return {
    async resolve(sourceUrl: string): Promise<OdesliResult> {
      await throttle()
      const url = `${ENDPOINT}?url=${encodeURIComponent(sourceUrl)}`
      const res = await fetchFn(url, { signal: AbortSignal.timeout(timeoutMs) })
      if (res.status === 404) return { notFound: true, providerRefs: {} }
      if (!res.ok) throw new Error(`odesli ${res.status}`) // transient → pg-boss retries
      return mapOdesli((await res.json()) as OdesliBody)
    },
  }
}
