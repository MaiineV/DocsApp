export const DOC_IMAGES_BUCKET = 'doc-images'

// SVG deliberately excluded: it can carry scripts.
export const IMAGE_MIME: Readonly<Record<string, string>> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
}

export const MAX_IMAGE_BYTES = 10 * 1024 * 1024

export type ImageValidation =
  | { ok: true; ext: string }
  | { ok: false; reason: 'type' | 'size' }

export function validateImageFile(file: { type: string; size: number }): ImageValidation {
  const ext = IMAGE_MIME[file.type]
  if (!ext) return { ok: false, reason: 'type' }
  if (file.size <= 0 || file.size > MAX_IMAGE_BYTES) return { ok: false, reason: 'size' }
  return { ok: true, ext }
}

/** Object path inside the bucket: `<teamId>/<docId>/<uuid>.<ext>`. */
export function buildImagePath(teamId: string, docId: string, uuid: string, ext: string): string {
  return `${teamId}/${docId}/${uuid}.${ext}`
}

export function docImagesPrefix(teamId: string, docId: string): string {
  return `${teamId}/${docId}`
}

export function publicImageUrl(supabaseUrl: string, path: string): string {
  const base = supabaseUrl.replace(/\/+$/, '')
  return `${base}/storage/v1/object/public/${DOC_IMAGES_BUCKET}/${path}`
}
