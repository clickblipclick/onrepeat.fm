import { ImageResponse } from 'next/og'
import { OG_SIZE, loadOgFonts, RepeatBrandCard } from './_og/repeat-card'

export const runtime = 'nodejs'
export const size = OG_SIZE
export const contentType = 'image/png'
export const alt = 'onrepeat.fm — one song. seven days.'

export default async function Image() {
  return new ImageResponse(<RepeatBrandCard />, {
    ...OG_SIZE,
    fonts: await loadOgFonts(),
  })
}
