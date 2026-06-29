// Cliente local de ejemplo + smoke test E2E de la API (`/api/v1`).
// Hace login con tu cuenta, lista equipos, crea un doc, lo lee en markdown, lo
// edita (en vivo) y lo borra. No hardcodea secretos: lee la URL/anon key de
// .env.local y las credenciales de variables de entorno.
//
// Uso:
//   DOCSAPP_EMAIL=vos@ejemplo.com DOCSAPP_PASSWORD=••• node scripts/api-smoke.mjs
// Opcionales:
//   DOCSAPP_API_BASE=http://localhost:3000/api/v1   (default)
//   DOCSAPP_KEEP=1   -> no borra el doc al final (para probar el broadcast en vivo)

import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

function fromEnvFile(key) {
  try {
    const txt = readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
    const line = txt.split('\n').find((l) => l.trim().startsWith(key + '='))
    return line ? line.slice(line.indexOf('=') + 1).trim().replace(/^["']|["']$/g, '') : undefined
  } catch {
    return undefined
  }
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? fromEnvFile('NEXT_PUBLIC_SUPABASE_URL')
const SUPABASE_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? fromEnvFile('NEXT_PUBLIC_SUPABASE_ANON_KEY')
const EMAIL = process.env.DOCSAPP_EMAIL ?? process.argv[2]
const PASSWORD = process.env.DOCSAPP_PASSWORD ?? process.argv[3]
const BASE = process.env.DOCSAPP_API_BASE ?? 'http://localhost:3000/api/v1'

if (!SUPABASE_URL || !SUPABASE_ANON) {
  console.error('Falta NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY (.env.local o env).')
  process.exit(2)
}
if (!EMAIL || !PASSWORD) {
  console.error('Falta DOCSAPP_EMAIL / DOCSAPP_PASSWORD (env o argv).')
  process.exit(2)
}

const EDITOR_ROLES = new Set(['owner', 'admin', 'editor'])
let token

async function api(method, path, body) {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })
  const text = await res.text()
  let json
  try { json = text ? JSON.parse(text) : null } catch { json = text }
  return { status: res.status, json }
}

async function main() {
  // 1) login -> token
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON)
  const { data, error } = await supabase.auth.signInWithPassword({ email: EMAIL, password: PASSWORD })
  if (error || !data.session) { console.error('Login falló:', error?.message); process.exit(1) }
  token = data.session.access_token
  console.log('✅ login OK')

  // 2) equipos
  const teams = await api('GET', '/teams')
  console.log(`✅ GET /teams -> ${teams.status}:`, JSON.stringify(teams.json))
  const team = (teams.json?.teams ?? []).find((t) => EDITOR_ROLES.has(t.role))
  if (!team) { console.error('No hay equipo con rol editor+; no se puede crear.'); process.exit(1) }

  // 3) crear
  const create = await api('POST', `/teams/${team.id}/documents`, {
    title: 'API smoke ' + new Date().toISOString(),
    content: '# Creado por la API\n\nHola **mundo**.\n\n- uno\n- dos\n',
    format: 'markdown',
  })
  console.log(`✅ POST create -> ${create.status}`)
  const id = create.json?.document?.id
  if (!id) { console.error('No se creó el doc:', JSON.stringify(create.json)); process.exit(1) }
  console.log(`   doc id: ${id}  (abrilo en ${BASE.replace('/api/v1', '')}/docs/${id} para ver el broadcast en vivo)`)

  // 4) leer markdown
  const read = await api('GET', `/documents/${id}?format=markdown`)
  console.log(`✅ GET ?format=markdown -> ${read.status}\n--- markdown ---\n${read.json?.document?.content}\n----------------`)

  // 5) editar (broadcast en vivo si lo tenés abierto)
  const patch = await api('PATCH', `/documents/${id}`, {
    content: '# Editado por la API\n\nEsto reemplazó el cuerpo.\n\n> En vivo si lo tenés abierto.\n',
    format: 'markdown',
  })
  console.log(`✅ PATCH -> ${patch.status}:`, JSON.stringify(patch.json))

  const read2 = await api('GET', `/documents/${id}?format=markdown`)
  console.log(`✅ GET tras editar:\n--- markdown ---\n${read2.json?.document?.content}\n----------------`)

  // 6) borrar (salvo DOCSAPP_KEEP=1)
  if (process.env.DOCSAPP_KEEP === '1') {
    console.log(`ℹ️  DOCSAPP_KEEP=1 -> no borro. Probá PATCH a mano contra ${id} con el doc abierto.`)
  } else {
    const del = await api('DELETE', `/documents/${id}`)
    console.log(`✅ DELETE -> ${del.status} (204 esperado)`)
  }

  console.log('\n=== SMOKE OK ===')
}

main().catch((e) => { console.error('SMOKE CRASH:', e); process.exit(1) })
