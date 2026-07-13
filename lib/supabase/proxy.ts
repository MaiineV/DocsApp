import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

// Refresca la sesión de Supabase en cada request y redirige a /login si no hay
// usuario. Se invoca desde el `proxy.ts` raíz (en Next 16 el middleware se
// llama "proxy"). No metas lógica entre createServerClient y getClaims.
export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          )
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          )
        },
      },
    },
  )

  // getClaims() verifica la firma del JWT (local con clave asimétrica vía
  // JWKS; con secreto simétrico cae a una llamada a Auth, como getUser) y —
  // vía su getSession() interno — REFRESCA la sesión si expiró: esa es la
  // función de este proxy. getSession() solo NO revalida. No agregar código
  // entre createServerClient y esta llamada, o habrá logouts random.
  const { data } = await supabase.auth.getClaims()
  const user = data?.claims

  const path = request.nextUrl.pathname
  // Rutas públicas (sin login): auth + los links view-only `/share/<token>`, que se
  // resuelven por RPC anon (SECURITY DEFINER) sin sesión. Sin esto el proxy las
  // redirigiría a /login antes de renderizar.
  const isPublicRoute =
    path.startsWith('/login') ||
    path.startsWith('/signup') ||
    path.startsWith('/auth') ||
    path.startsWith('/share')

  if (!user && !isPublicRoute) {
    const original = path + request.nextUrl.search // ruta+query original
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    url.search = '' // limpiar la query original
    if (path !== '/') url.searchParams.set('next', original) // para volver tras loguear
    return NextResponse.redirect(url)
  }

  // Devolver supabaseResponse tal cual: lleva las cookies de sesión refrescadas.
  return supabaseResponse
}
