import { type NextRequest } from 'next/server'
import { updateSession } from '@/lib/supabase/proxy'

// Next 16: el middleware ahora se llama "proxy". Refresca la sesión Supabase
// y protege rutas en cada request (corre en el runtime de Node.js).
export async function proxy(request: NextRequest) {
  return await updateSession(request)
}

export const config = {
  // Corre en todo menos assets estáticos.
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
