'use server'

import { revalidatePath } from 'next/cache'
import { getSessionAgent } from '../lib/session'
import { postJam, likeJam, unlikeJam, reJam, type PostJamResult } from '@onrepeat/repo'
import { providerFromUrl } from '@onrepeat/core'
import { db } from '../lib/db'
import { indexJam } from '@onrepeat/db'

/**
 * After a jam write succeeds: index it into our Postgres immediately (read-your-writes,
 * best-effort — the ingester backfills idempotently off the firehose if this fails) and
 * refresh the views that show the user's current jam. `label` identifies the caller in logs.
 */
async function afterJamWrite(
  label: string,
  args: { uri: string; cid: string; did: string; record: PostJamResult['record'] },
): Promise<void> {
  try {
    await indexJam(db, args)
  } catch (e) {
    console.error(`[web] ${label}: write-through index failed (firehose will backfill)`, e)
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
  const agent = await getSessionAgent()
  if (!agent) return { ok: false, error: 'not logged in' }

  const sourceUrl = String(formData.get('sourceUrl') ?? '').trim()
  const title = String(formData.get('title') ?? '').trim()
  const artist = String(formData.get('artist') ?? '').trim()
  const caption = String(formData.get('caption') ?? '').trim()
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
    })
    await afterJamWrite('postJam', { uri, cid, did: agent.assertDid, record })
    return { ok: true, uri }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'failed' }
  }
}

function rkeyFromUri(uri: string): string {
  return uri.split('/').pop() ?? ''
}

export interface ActionResult {
  ok: boolean
  error?: string
  /** the created like's at-uri (so the client can unlike without a DB round-trip) */
  likeUri?: string
}

export async function likeJamAction(subject: { uri: string; cid: string }): Promise<ActionResult> {
  const agent = await getSessionAgent()
  if (!agent) return { ok: false, error: 'not logged in' }
  try {
    const res = await likeJam(agent, subject)
    return { ok: true, likeUri: res.uri }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'failed' }
  }
}

export async function unlikeJamAction(subjectUri: string, likeUri?: string): Promise<ActionResult> {
  const agent = await getSessionAgent()
  if (!agent) return { ok: false, error: 'not logged in' }
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
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'failed' }
  }
}

export interface ReJamArgs {
  uri: string
  did: string
  sourceUrl: string
  sourceProvider: string | null
  title: string
  artist: string
  artworkUrl: string | null
}

export async function reJamAction(jam: ReJamArgs): Promise<ActionResult> {
  const agent = await getSessionAgent()
  if (!agent) return { ok: false, error: 'not logged in' }
  try {
    const { uri, cid, record } = await reJam(agent, {
      sourceJam: { uri: jam.uri, did: jam.did },
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
