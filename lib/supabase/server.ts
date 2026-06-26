import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

// Cliente Supabase para el server (Server Components, Server Actions, Route
// Handlers). En Next 16 `cookies()` es async. Maneja cookies con getAll/setAll.
export async function createClient() {
  const cookieStore = await cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            )
          } catch {
            // Llamado desde un Server Component (no puede setear cookies).
            // El proxy refresca la sesión, así que es seguro ignorar.
          }
        },
      },
    },
  )
}
