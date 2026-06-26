import { createBrowserClient } from '@supabase/ssr'

// Cliente Supabase para el browser (Client Components). Usa la anon key
// pública; toda la seguridad la da RLS del lado de la base de datos.
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  )
}
