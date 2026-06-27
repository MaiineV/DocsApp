import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'
import type { Profile } from '@/lib/types'

// Perfil del usuario actual (cache por request). Null si no hay sesión.
export const getMyProfile = cache(async (): Promise<Profile | null> => {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null
  const { data } = await supabase
    .from('profiles')
    .select('id, nickname, avatar_url')
    .eq('id', user.id)
    .maybeSingle()
  return (data as Profile | null) ?? { id: user.id, nickname: null, avatar_url: null }
})
