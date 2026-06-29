import { type NextRequest } from 'next/server'
import { updateSession } from '@/lib/supabase/proxy'

// Next 16: el middleware ahora se llama "proxy". Refresca la sesión Supabase
// y protege rutas en cada request (corre en el runtime de Node.js).
export async function proxy(request: NextRequest) {
  return await updateSession(request)
}

export const config = {
  // Corre en todo menos assets estáticos y la API. `/api/**` se excluye porque se
  // autentica por `Authorization: Bearer <jwt>` (no cookies); sin esto el proxy
  // redirigiría las requests sin cookie a /login (302) en vez de dejarlas llegar
  // al route handler, que valida el token y aplica la RLS por su cuenta.
  matcher: [
    '/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
