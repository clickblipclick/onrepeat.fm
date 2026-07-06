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

function bytesAt(bytes: Uint8Array, sig: number[], offset = 0): boolean {
  if (bytes.length < offset + sig.length) return false
  return sig.every((b, i) => bytes[offset + i] === b)
}

/**
 * True iff `bytes` begin with the magic signature of the claimed content type.
 * Defense-in-depth behind isImageContentType: the Content-Type header is the
 * origin server's claim, this checks the payload actually is that format.
 */
export function matchesImageSignature(ct: string, bytes: Uint8Array): boolean {
  switch (ct) {
    case 'image/jpeg':
      return bytesAt(bytes, [0xff, 0xd8, 0xff])
    case 'image/png':
      return bytesAt(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    case 'image/gif': // GIF87a or GIF89a
      return (
        bytesAt(bytes, [0x47, 0x49, 0x46, 0x38, 0x37, 0x61]) ||
        bytesAt(bytes, [0x47, 0x49, 0x46, 0x38, 0x39, 0x61])
      )
    case 'image/webp': // RIFF....WEBP
      return (
        bytesAt(bytes, [0x52, 0x49, 0x46, 0x46]) &&
        bytesAt(bytes, [0x57, 0x45, 0x42, 0x50], 8)
      )
    case 'image/avif': // ISO BMFF: 'ftyp' at offset 4 (brand varies: avif/avis/mif1)
      return bytesAt(bytes, [0x66, 0x74, 0x79, 0x70], 4)
    default:
      return false
  }
}
