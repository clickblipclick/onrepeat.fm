'use server'

import { getSessionAgent } from '../lib/session'
import { postJam } from '@onrepeat/repo'
import { providerFromUrl } from '@onrepeat/core'

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
    const res = await postJam(agent, {
      sourceUrl,
      sourceProvider: providerFromUrl(sourceUrl) ?? 'unknown',
      title,
      artist,
      caption: caption || undefined,
    })
    return { ok: true, uri: res.uri }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'failed' }
  }
}
