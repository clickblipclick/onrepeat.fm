import { cn } from '@/lib/cn'

/** The uppercase muted label used for page titles and in-page section headers.
 *  One source for the size + spacing rules that were hand-rolled across pages. */
export function SectionLabel({
  as: Tag = 'h2',
  size = 'section',
  flush = false,
  className,
  children,
}: {
  /** Semantic element — pages pass "h1" for the page title. */
  as?: 'h1' | 'h2'
  /** "title" = page heading (text-sm, mb-4); "section" = sub-section (text-xs, mt-6 mb-2). */
  size?: 'title' | 'section'
  /** Drop the default margins; caller owns spacing via className. */
  flush?: boolean
  className?: string
  children: React.ReactNode
}) {
  const sizing = size === 'title' ? 'text-sm' : 'text-xs'
  const spacing = size === 'title' ? 'mb-4' : 'mt-6 mb-2'
  return (
    <Tag
      className={cn(
        'text-muted uppercase',
        sizing,
        !flush && spacing,
        className,
      )}
    >
      {children}
    </Tag>
  )
}
