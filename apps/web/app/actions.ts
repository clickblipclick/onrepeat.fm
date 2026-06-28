'use server'

import { revalidatePath } from 'next/cache'

import { getFollowRecord } from '@onrepeat/appview'
import { isThemeName, providerFromUrl } from '@onrepeat/core'
import {
  indexFollow,
  indexJam,
  indexLike,
  removeFollow,
  removeJam,
  removeLike,
  setActorTheme,
} from '@onrepeat/db'
import { enqueueResolveForJam } from '@onrepeat/jobs'
import {
  deriveTrack,
  fetchYoutubeCategory,
  type DeriveResult,
} from '@onrepeat/music'
import {
  deleteJam,
  follow,
  likeJam,
  postJam,
  putProfile,
  reJam,
  RepoWriteError,
  unfollow,
  unlikeJam,
  type PostJamResult,
} from '@onrepeat/repo'

import { didFromUri, rkeyFromUri } from '../lib/at-uri'
import { db } from '../lib/db'
import { getBoss } from '../lib/jobs'
import { getSessionAgent } from '../lib/session'

/**
 * After a jam write succeeds: index it into our Postgres and enqueue its resolve job
 * immediately (read-your-writes), then refresh the views that show the user's current jam.
 * Both steps are best-effort — the ingester re-does them idempotently off the firehose if
 * this fails — but doing them here means the author's own jam resolves right away instead
 * of waiting on the relay round-trip. `label` identifies the caller in logs.
 */
async function afterJamWrite(
  label: string,
  args: {
    uri: string
    cid: string
    did: string
    record: PostJamResult['record']
  },
): Promise<void> {
  try {
    await indexJam(db, args)
    // enqueueResolveForJam upserts the track, links jams.track_id, and enqueues the
    // resolve job (deduped by singletonKey, so the firehose re-enqueue is a harmless no-op).
    const boss = await getBoss()
    await enqueueResolveForJam(boss, db, { uri: args.uri, record: args.record })
  } catch (e) {
    console.error(
      `[web] ${label}: write-through index/enqueue failed (firehose will backfill)`,
      e,
    )
  }
  revalidatePath('/')
  revalidatePath('/explore')
  revalidatePath('/profile/[handle]', 'page')
}

export interface PostJamState {
  ok: boolean
  error?: string
  uri?: string
}

export async function postJamAction(
  _prevState: PostJamState | null,
  formData: FormData,
): Promise<PostJamState> {
  const res = await getSessionAgent()
  if (!res.agent)
    return {
      ok: false,
      error: res.reason === 'transient' ? 'temporary' : 'session-expired',
    }
  const agent = res.agent

  const sourceUrl = String(formData.get('sourceUrl') ?? '').trim()
  const title = String(formData.get('title') ?? '').trim()
  const artist = String(formData.get('artist') ?? '').trim()
  const caption = String(formData.get('caption') ?? '').trim()
  const artworkUrl = String(formData.get('artworkUrl') ?? '').trim()
  if (!sourceUrl || !title || !artist) {
    return { ok: false, error: 'sourceUrl, title, artist required' }
  }

  try {
    const { uri, cid, record } = await postJam(agent, {
      sourceUrl,
      sourceProvider: providerFromUrl(sourceUrl) ?? 'unknown',
      title,
      artist,
      caption: caption || undefined,
      artworkUrl: artworkUrl || undefined,
    })
    await afterJamWrite('postJam', { uri, cid, did: agent.assertDid, record })
    // Navigation is the caller's concern now: the modal pops back to the (revalidated)
    // feed via router.back(); the full /post page does router.replace('/'). afterJamWrite
    // already revalidated '/', so either way the new jam is on top when we land.
    return { ok: true, uri }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'failed' }
  }
}

export async function deriveTrackAction(url: string): Promise<DeriveResult> {
  const res = await getSessionAgent()
  // Not signed in / session hiccup — retryable from the user's point of view.
  if (!res.agent) return { ok: false, reason: 'transient' }
  // When a YouTube Data API key is configured, flag plain youtube.com videos that
  // aren't in the Music category ('10') so the form can warn before posting.
  const apiKey = process.env.YOUTUBE_API_KEY
  const classifyYoutubeMusic = apiKey
    ? async (videoId: string) => {
        const cat = await fetchYoutubeCategory(videoId, { apiKey })
        return cat == null ? null : cat === '10'
      }
    : undefined
  try {
    return await deriveTrack(url, { classifyYoutubeMusic })
  } catch (err) {
    console.error('[web] deriveTrackAction failed', err)
    return { ok: false, reason: 'transient' }
  }
}

export interface ActionResult {
  ok: boolean
  error?: string
  /** the created like's at-uri (so the client can unlike without a DB round-trip) */
  likeUri?: string
}

export async function likeJamAction(subject: {
  uri: string
  cid: string
}): Promise<ActionResult> {
  const res = await getSessionAgent()
  if (!res.agent)
    return {
      ok: false,
      error: res.reason === 'transient' ? 'temporary' : 'session-expired',
    }
  const agent = res.agent
  try {
    const { uri, record } = await likeJam(agent, subject)
    // Write-through index for read-your-writes (best-effort: the firehose event
    // re-applies it idempotently if this fails). Also makes an immediate unlike
    // find the row instead of racing the ingester to 'like-not-found'.
    try {
      await indexLike(db, { uri, did: agent.assertDid, record })
    } catch (e) {
      console.error(
        '[web] likeJam: write-through index failed (firehose will backfill)',
        e,
      )
    }
    return { ok: true, likeUri: uri }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'failed' }
  }
}

export async function unlikeJamAction(
  subjectUri: string,
  likeUri?: string,
): Promise<ActionResult> {
  const res = await getSessionAgent()
  if (!res.agent)
    return {
      ok: false,
      error: res.reason === 'transient' ? 'temporary' : 'session-expired',
    }
  const agent = res.agent
  try {
    // Prefer the like-uri the client kept from this session; otherwise look up
    // the viewer's like on this subject in the index.
    let uri = likeUri
    if (!uri) {
      const row = await db
        .selectFrom('likes')
        .select('uri')
        .where('subject_uri', '=', subjectUri)
        .where('author_did', '=', agent.assertDid)
        .executeTakeFirst()
      uri = row?.uri
    }
    if (!uri) return { ok: false, error: 'like-not-found' }
    await unlikeJam(agent, rkeyFromUri(uri))
    try {
      await removeLike(db, uri)
    } catch (e) {
      console.error(
        '[web] unlikeJam: write-through removal failed (firehose will backfill)',
        e,
      )
    }
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'failed' }
  }
}

export interface ReJamArgs {
  uri: string
  cid: string
  sourceUrl: string
  sourceProvider: string | null
  title: string
  artist: string
  artworkUrl: string | null
}

export async function reJamAction(jam: ReJamArgs): Promise<ActionResult> {
  const res = await getSessionAgent()
  if (!res.agent)
    return {
      ok: false,
      error: res.reason === 'transient' ? 'temporary' : 'session-expired',
    }
  const agent = res.agent
  try {
    const { uri, cid, record } = await reJam(agent, {
      sourceJam: { uri: jam.uri, cid: jam.cid },
      track: {
        sourceUrl: jam.sourceUrl,
        sourceProvider: jam.sourceProvider ?? 'unknown',
        title: jam.title,
        artist: jam.artist,
        artworkUrl: jam.artworkUrl ?? undefined,
      },
    })
    await afterJamWrite('reJam', { uri, cid, did: agent.assertDid, record })
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'failed' }
  }
}

export interface SaveThemeState {
  ok: boolean
  error?: string
}

/** Persist the user's chosen profile color theme: write the fm.onrepeat.actor.profile record,
 *  then write-through the denormalized index copy and refresh the themed views. */
export async function saveThemeAction(
  _prevState: SaveThemeState | null,
  formData: FormData,
): Promise<SaveThemeState> {
  const theme = String(formData.get('theme') ?? '')
  if (!isThemeName(theme)) return { ok: false, error: 'invalid-theme' }

  const res = await getSessionAgent()
  if (!res.agent)
    return {
      ok: false,
      error: res.reason === 'transient' ? 'temporary' : 'session-expired',
    }
  const agent = res.agent

  try {
    await putProfile(agent, { colorTheme: theme })
  } catch (err) {
    // Sessions created before the profile scope was added can't write it until the
    // user re-consents — surface that as a re-login, like the post form does.
    if (err instanceof RepoWriteError && err.kind === 'auth')
      return { ok: false, error: 'session-expired' }
    return { ok: false, error: err instanceof Error ? err.message : 'failed' }
  }

  // Write-through the denormalized copy for read-your-writes (the firehose re-applies
  // it idempotently if this fails).
  try {
    await setActorTheme(db, agent.assertDid, theme)
  } catch (e) {
    console.error(
      '[web] saveTheme: write-through failed (firehose will backfill)',
      e,
    )
  }
  // A theme change is app-wide: it re-colors the viewer's chrome on every page AND their
  // post cards wherever they appear (feeds, profiles, jam pages, the settings preview).
  // revalidatePath('/', 'layout') invalidates all of it in one call.
  revalidatePath('/', 'layout')
  return { ok: true }
}

export async function deleteJamAction(uri: string): Promise<ActionResult> {
  const res = await getSessionAgent()
  if (!res.agent)
    return {
      ok: false,
      error: res.reason === 'transient' ? 'temporary' : 'session-expired',
    }
  const agent = res.agent

  // Defensive ownership check on top of the PDS's own-repo constraint:
  // the at-uri's authority (DID) must be the session DID.
  if (didFromUri(uri) !== agent.assertDid)
    return { ok: false, error: 'not-owner' }

  try {
    await deleteJam(agent, rkeyFromUri(uri))
    // Write-through index removal for read-your-writes (best-effort: the firehose
    // delete event reconciles the index idempotently if this fails).
    try {
      await removeJam(db, uri)
    } catch (e) {
      console.error('[web] deleteJam: write-through removal failed', e)
    }
    revalidatePath('/')
    revalidatePath('/explore')
    revalidatePath('/profile/[handle]', 'page')
    revalidatePath('/profile/[handle]/jam/[rkey]', 'page')
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'failed' }
  }
}

export async function followAction(subjectDid: string): Promise<ActionResult> {
  const res = await getSessionAgent()
  if (!res.agent)
    return {
      ok: false,
      error: res.reason === 'transient' ? 'temporary' : 'session-expired',
    }
  const agent = res.agent
  if (subjectDid === agent.assertDid)
    return { ok: false, error: 'cannot-follow-self' }

  try {
    const { uri, record } = await follow(agent, subjectDid)
    // Write-through for read-your-writes (the firehose re-applies idempotently if this fails).
    try {
      await indexFollow(db, { uri, did: agent.assertDid, record })
    } catch (e) {
      console.error(
        '[web] follow: write-through index failed (firehose will backfill)',
        e,
      )
    }
    revalidatePath('/')
    revalidatePath('/profile/[handle]', 'page')
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'failed' }
  }
}

export async function unfollowAction(subjectDid: string): Promise<ActionResult> {
  const res = await getSessionAgent()
  if (!res.agent)
    return {
      ok: false,
      error: res.reason === 'transient' ? 'temporary' : 'session-expired',
    }
  const agent = res.agent

  try {
    const existing = await getFollowRecord(db, agent.assertDid, subjectDid)
    if (!existing) return { ok: false, error: 'follow-not-found' }
    await unfollow(agent, rkeyFromUri(existing.uri))
    try {
      await removeFollow(db, existing.uri)
    } catch (e) {
      console.error(
        '[web] unfollow: write-through removal failed (firehose will backfill)',
        e,
      )
    }
    revalidatePath('/')
    revalidatePath('/profile/[handle]', 'page')
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'failed' }
  }
}
