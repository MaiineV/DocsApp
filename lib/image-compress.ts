export const COMPRESS_MAX_DIM = 1600
export const COMPRESS_MIN_BYTES = 400 * 1024
const QUALITY = 0.85

// GIF would lose its animation and WebP is already compressed.
const COMPRESSIBLE = new Set(['image/png', 'image/jpeg'])

export type CompressedImage = { blob: Blob; type: string; ext: string }

/** Downscales png/jpeg to 1600px WebP in the browser; returns the original when that is not smaller. */
export async function compressImage(file: File): Promise<CompressedImage> {
  const original: CompressedImage = { blob: file, type: file.type, ext: extOf(file.type) }
  if (!COMPRESSIBLE.has(file.type)) return original
  if (typeof createImageBitmap !== 'function' || typeof document === 'undefined') return original

  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(file)
  } catch {
    return original
  }

  try {
    const scale = Math.min(1, COMPRESS_MAX_DIM / Math.max(bitmap.width, bitmap.height))
    if (scale === 1 && file.size < COMPRESS_MIN_BYTES) return original

    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(bitmap.width * scale))
    canvas.height = Math.max(1, Math.round(bitmap.height * scale))
    const ctx = canvas.getContext('2d')
    if (!ctx) return original
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)

    const webp = await toBlob(canvas, 'image/webp', QUALITY)
    // Browsers without WebP encoding hand back a PNG; JPEG is a safe fallback only when the source had no alpha.
    const out =
      webp && webp.type === 'image/webp'
        ? webp
        : file.type === 'image/jpeg'
          ? await toBlob(canvas, 'image/jpeg', QUALITY)
          : null
    if (!out || out.size >= file.size) return original
    return { blob: out, type: out.type, ext: extOf(out.type) }
  } finally {
    bitmap.close()
  }
}

function toBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality))
}

function extOf(type: string): string {
  switch (type) {
    case 'image/png':
      return 'png'
    case 'image/jpeg':
      return 'jpg'
    case 'image/gif':
      return 'gif'
    case 'image/webp':
      return 'webp'
    default:
      return 'bin'
  }
}
