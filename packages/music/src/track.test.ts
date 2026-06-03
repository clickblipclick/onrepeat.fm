import { describe, it, expect } from 'vitest'
import { deriveTrack } from './track'

describe('deriveTrack', () => {
  it('apple url → iTunes lookup', async () => {
    const fetchFn = async (url: string) => {
      expect(url).toContain('itunes.apple.com/lookup')
      return { ok: true, status: 200, async json() { return { results: [{ trackName: 'T', artistName: 'A', artworkUrl100: 'https://x/100x100bb.jpg', trackViewUrl: 'https://music.apple.com/us/album/t/1?i=2' }] } } }
    }
    const r = await deriveTrack('https://music.apple.com/us/album/t/1?i=2', { fetchFn })
    expect(r).toMatchObject({ title: 'T', artist: 'A', provider: 'applemusic', sourceUrl: 'https://music.apple.com/us/album/t/1?i=2' })
  })

  it('youtube url → oEmbed, splitting "Artist - Title"', async () => {
    const fetchFn = async () => ({ ok: true, status: 200, async json() { return { title: 'Frank Ocean - Thinkin Bout You (Official)', author_name: 'FrankOceanVEVO', thumbnail_url: 'https://t/i.jpg' } } })
    const r = await deriveTrack('https://youtu.be/abc', { fetchFn })
    expect(r).toMatchObject({ title: 'Thinkin Bout You (Official)', artist: 'Frank Ocean', provider: 'youtube' })
  })

  it('spotify url with a plain title → title kept, artist falls back to author', async () => {
    const fetchFn = async () => ({ ok: true, status: 200, async json() { return { title: 'Thinkin Bout You', author_name: '', thumbnail_url: 'https://t/i.jpg' } } })
    const r = await deriveTrack('https://open.spotify.com/track/x', { fetchFn })
    expect(r).toMatchObject({ title: 'Thinkin Bout You', artist: '', provider: 'spotify' })
  })

  it('unknown provider → null (manual entry)', async () => {
    expect(await deriveTrack('https://example.com/song')).toBeNull()
  })

  it('soft-fails to null when the lookup errors', async () => {
    const fetchFn = async () => { throw new Error('network') }
    expect(await deriveTrack('https://open.spotify.com/track/x', { fetchFn })).toBeNull()
  })
})
