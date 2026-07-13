import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'

// Usuario autenticado del request actual, con `React.cache`: un solo
// `auth.getUser()` (round-trip a Supabase Auth) por render pass, compartido
// entre layout, page, getMyTeams y getMyProfile. Antes cada uno llamaba al
// suyo y el dedupe dependía de la memoización de fetch de Next (implícita y
// frágil ante cambios de headers). Null si no hay sesión.
export const getAuthUser = cache(async () => {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  return user
})
