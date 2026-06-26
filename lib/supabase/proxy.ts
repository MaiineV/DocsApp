import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

// Refresca la sesión de Supabase en cada request y redirige a /login si no hay
// usuario. Se invoca desde el `proxy.ts` raíz (en Next 16 el middleware se
// llama "proxy"). No metas lógica entre createServerClient y getUser.
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

  // getUser() revalida el token contra Auth (getSession() NO). No agregar
  // código entre createServerClient y esta llamada, o habrá logouts random.
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const path = request.nextUrl.pathname
  const isAuthRoute =
    path.startsWith('/login') ||
    path.startsWith('/signup') ||
    path.startsWith('/auth')

  if (!user && !isAuthRoute) {
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
