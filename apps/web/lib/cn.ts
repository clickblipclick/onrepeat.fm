/** Join class names, dropping falsy values. Caller-supplied classes go last so they win
 *  source order. (No tailwind-merge — keep it dependency-free; conflicts are the caller's call.) */
export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ')
}
