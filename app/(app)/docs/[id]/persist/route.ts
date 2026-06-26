import { createClient } from '@/lib/supabase/server'
import { casMergeYdoc } from '@/lib/yjs/persist'

// Flush de durabilidad para `navigator.sendBeacon` en pagehide/visibilitychange:
// cuando el último editor cierra la pestaña antes de que dispare el autosave
// debounced, el beacon empuja el snapshot acá. Mismo CAS+merge y misma RLS
// (cookie session → editor+) que persistYdoc. fire-and-forget: el cliente no
// espera la respuesta.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return new Response(null, { status: 400 })
  }

  const snapshot = (body as { snapshot?: unknown })?.snapshot
  const content = (body as { content?: unknown })?.content
  if (typeof snapshot !== 'string') return new Response(null, { status: 400 })

  const supabase = await createClient()
  const res = await casMergeYdoc(
    supabase,
    id,
    snapshot,
    typeof content === 'string' ? content : undefined,
  )
  return new Response(null, { status: res.ok ? 204 : res.status })
}
