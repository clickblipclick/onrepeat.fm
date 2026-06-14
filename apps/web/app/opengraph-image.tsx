import { ImageResponse } from 'next/og'
import { OG_SIZE, loadOgFonts, RepeatBrandCard } from './_og/repeat-card'

export const runtime = 'nodejs'
export const size = OG_SIZE
export const contentType = 'image/png'
export const alt = "onrepeat.fm — the song you've got on repeat."

export default async function Image() {
  let fonts: Awaited<ReturnType<typeof loadOgFonts>> | undefined
  try {
    fonts = await loadOgFonts()
  } catch {
    // fonts unavailable on disk — still return an image (system fallback font)
  }
  return new ImageResponse(<RepeatBrandCard />, {
    ...OG_SIZE,
    ...(fonts ? { fonts } : {}),
  })
}
