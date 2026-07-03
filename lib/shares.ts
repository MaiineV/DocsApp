import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'

export type ActiveShare = { token: string; include_subpages: boolean }

// Link de share ACTIVO (no revocado) de un documento, o null. La RLS
// `document_shares_select` gatea a editor+ del team → un viewer ve null (igual el
// botón Compartir está gated a canEdit). Cacheado por request: la page del doc lo
// usa una sola vez para hidratar el diálogo.
export const getActiveShare = cache(
  async (docId: string): Promise<ActiveShare | null> => {
    const supabase = await createClient()
    const { data } = await supabase
      .from('document_shares')
      .select('token, include_subpages')
      .eq('document_id', docId)
      .is('revoked_at', null)
      .maybeSingle()
    return data
      ? { token: data.token as string, include_subpages: data.include_subpages as boolean }
      : null
  },
)
