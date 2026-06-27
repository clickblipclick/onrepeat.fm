/**
 * Raster image content types we will persist, mapped to a file extension. SVG is
 * deliberately excluded — it can carry script and is never legitimate cover art.
 */
const EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/avif': 'avif',
}

/** True iff `ct` is a content type we are willing to store. */
export function isImageContentType(ct: string): boolean {
  return ct in EXT
}

/** File extension for a known image content type (only call when isImageContentType is true). */
export function extFromContentType(ct: string): string {
  return EXT[ct] ?? 'img'
}
