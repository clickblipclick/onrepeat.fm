import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { ThemeName } from '@onrepeat/core'
import { themeAccent, titleFontSize } from '../../lib/share'

export const OG_SIZE = { width: 1200, height: 630 }
const FONT_DIR = join(process.cwd(), 'app/_og/fonts')

export async function loadOgFonts() {
  const [regular, bold] = await Promise.all([
    readFile(join(FONT_DIR, 'JetBrainsMono-Regular.ttf')),
    readFile(join(FONT_DIR, 'JetBrainsMono-Bold.ttf')),
  ])
  return [
    { name: 'JetBrains Mono', data: regular, weight: 400 as const, style: 'normal' as const },
    { name: 'JetBrains Mono', data: bold, weight: 700 as const, style: 'normal' as const },
  ]
}

// 24×24 Lucide `repeat` loop, drawn at the given pixel box.
function RepeatMark({ size, color }: { size: number; color: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="m17 2 4 4-4 4" />
      <path d="M3 11v-1a4 4 0 0 1 4-4h14" />
      <path d="m7 22-4-4 4-4" />
      <path d="M21 13v1a4 4 0 0 1-4 4H3" />
    </svg>
  )
}

function Wordmark({ accent, color }: { accent: string; color: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 30, fontWeight: 700, color }}>
      <RepeatMark size={34} color={accent} />
      <div style={{ display: 'flex' }}>
        onrepeat<span style={{ color: accent }}>.fm</span>
      </div>
    </div>
  )
}

/** Per-jam "split" card: artwork left, title/artist/wordmark right, accent bar bottom. */
export function RepeatJamCard(props: {
  title: string
  artist: string
  artworkUrl: string | null
  theme: ThemeName | undefined
}) {
  const accent = themeAccent(props.theme)
  const titleSize = titleFontSize(props.title)
  return (
    <div
      style={{
        display: 'flex',
        width: '100%',
        height: '100%',
        background: '#fafafa',
        color: '#18181a',
        fontFamily: 'JetBrains Mono',
      }}
    >
      <div
        style={{
          display: 'flex',
          width: 630,
          height: 630,
          flexShrink: 0,
          background: props.artworkUrl ? '#000' : '#e6e6e5',
        }}
      >
        {props.artworkUrl ? (
          <img
            src={props.artworkUrl}
            width={630}
            height={630}
            style={{ width: 630, height: 630, objectFit: 'cover' }}
            alt=""
          />
        ) : (
          <div style={{ display: 'flex', margin: 'auto' }}>
            <RepeatMark size={140} color="#9a9a9f" />
          </div>
        )}
      </div>
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          flex: 1,
          padding: 64,
          position: 'relative',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div style={{ display: 'flex' }}>
            <div style={{ display: 'block', fontSize: titleSize, fontWeight: 700,
              lineHeight: 1.15, overflow: 'hidden', lineClamp: 3 }}>
              {props.title}
            </div>
          </div>
          <div style={{ display: 'flex' }}>
            <div style={{ display: 'block', fontSize: 32, color: '#6b6b70',
              overflow: 'hidden', lineClamp: 2 }}>
              {props.artist}
            </div>
          </div>
        </div>
        <Wordmark accent={accent} color="#18181a" />
        <div
          style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 8, background: accent }}
        />
      </div>
    </div>
  )
}

/** Generic branded fallback: wordmark + tagline, neutral. */
export function RepeatBrandCard() {
  const accent = themeAccent(undefined)
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        width: '100%',
        height: '100%',
        background: '#fafafa',
        color: '#18181a',
        fontFamily: 'JetBrains Mono',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 28,
      }}
    >
      <RepeatMark size={120} color="#18181a" />
      <div style={{ display: 'flex', fontSize: 72, fontWeight: 700 }}>
        onrepeat<span style={{ color: accent }}>.fm</span>
      </div>
      <div style={{ display: 'flex', fontSize: 34, color: '#6b6b70' }}>one song. seven days.</div>
    </div>
  )
}
