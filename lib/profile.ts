import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'
import { getAuthUser } from '@/lib/auth/user'
import type { Profile } from '@/lib/types'

// Perfil del usuario actual (cache por request). Null si no hay sesión.
export const getMyProfile = cache(async (): Promise<Profile | null> => {
  const user = await getAuthUser()
  if (!user) return null
  const supabase = await createClient()
  const { data } = await supabase
    .from('profiles')
    .select('id, nickname, avatar_url')
    .eq('id', user.id)
    .maybeSingle()
  return (data as Profile | null) ?? { id: user.id, nickname: null, avatar_url: null }
})
