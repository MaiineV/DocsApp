'use client'

import type { SupabaseClient } from '@supabase/supabase-js'
import { createImageUploadUrl } from '@/app/(app)/docs/actions'
import { DOC_IMAGES_BUCKET, validateImageFile } from '@/lib/doc-images'
import { compressImage } from '@/lib/image-compress'

export class ImageUploadError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ImageUploadError'
  }
}

type Messages = { imageType: string; imageTooBig: string; imageUploadFailed: string }

/** Validates, compresses and uploads straight to Storage with a server-signed token; resolves to the public URL. */
export async function uploadDocImage(
  file: File,
  docId: string,
  supabase: SupabaseClient,
  t: Messages,
): Promise<string> {
  const pre = validateImageFile(file)
  if (!pre.ok) throw new ImageUploadError(pre.reason === 'type' ? t.imageType : t.imageTooBig)

  const img = await compressImage(file)
  const post = validateImageFile({ type: img.type, size: img.blob.size })
  if (!post.ok) throw new ImageUploadError(post.reason === 'type' ? t.imageType : t.imageTooBig)

  const ticket = await createImageUploadUrl(docId, { type: img.type, size: img.blob.size })
  if (!ticket.ok) throw new ImageUploadError(ticket.error)

  const { error } = await supabase.storage
    .from(DOC_IMAGES_BUCKET)
    .uploadToSignedUrl(ticket.path, ticket.token, img.blob, {
      contentType: img.type,
      cacheControl: '31536000',
    })
  if (error) {
    console.error('[doc-images] uploadToSignedUrl:', error)
    throw new ImageUploadError(t.imageUploadFailed)
  }
  return ticket.publicUrl
}
