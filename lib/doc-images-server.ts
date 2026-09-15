import { createAdminClient } from '@/lib/supabase/admin'
import { DOC_IMAGES_BUCKET, docImagesPrefix } from '@/lib/doc-images'

const PAGE = 1000

/** Best-effort removal of every image under `<teamId>/<docId>/`; failures are logged, never thrown. */
export async function deleteDocImages(teamId: string, docIds: string[]): Promise<void> {
  if (docIds.length === 0) return
  let admin
  try {
    admin = createAdminClient()
  } catch (e) {
    console.error('[doc-images] admin client unavailable, images not deleted:', e)
    return
  }
  const bucket = admin.storage.from(DOC_IMAGES_BUCKET)

  for (const docId of docIds) {
    const prefix = docImagesPrefix(teamId, docId)
    try {
      const paths: string[] = []
      for (let offset = 0; ; offset += PAGE) {
        const { data, error } = await bucket.list(prefix, { limit: PAGE, offset })
        if (error) throw error
        for (const obj of data ?? []) if (obj.name) paths.push(`${prefix}/${obj.name}`)
        if (!data || data.length < PAGE) break
      }
      if (paths.length === 0) continue
      const { error } = await bucket.remove(paths)
      if (error) throw error
    } catch (e) {
      console.error(`[doc-images] failed to delete images under ${prefix}:`, e)
    }
  }
}
