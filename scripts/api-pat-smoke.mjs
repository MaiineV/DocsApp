// Smoke test de la API por Personal Access Token (PAT).
// Verifica: auth por PAT (mintea JWT → RLS), headers X-RateLimit-*, CRUD de docs,
// scope read-only (403 al escribir) y, opcional, el corte por rate limit (429).
//
// Uso (creá un PAT read-write en /profile/tokens):
//   DOCSAPP_PAT=dapp_xxx node scripts/api-pat-smoke.mjs
// Opcionales:
//   DOCSAPP_PAT_READ=dapp_yyy   -> token scope=read: verifica 403 al escribir
//   DOCSAPP_BURST=1             -> dispara requests hasta recibir 429 (consume tu budget del minuto)
//   DOCSAPP_API_BASE=http://localhost:3000/api/v1   (default)

const BASE = process.env.DOCSAPP_API_BASE ?? 'http://localhost:3000/api/v1'
const PAT = process.env.DOCSAPP_PAT ?? process.argv[2]
const PAT_READ = process.env.DOCSAPP_PAT_READ
const EDITOR_ROLES = new Set(['owner', 'admin', 'editor'])

if (!PAT) {
  console.error('Falta DOCSAPP_PAT (env o argv). Creá un PAT read-write en /profile/tokens.')
  process.exit(2)
}

async function api(method, path, { token = PAT, body } = {}) {
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
  const rl = {
    limit: res.headers.get('x-ratelimit-limit'),
    remaining: res.headers.get('x-ratelimit-remaining'),
    reset: res.headers.get('x-ratelimit-reset'),
    retryAfter: res.headers.get('retry-after'),
  }
  return { status: res.status, json, rl }
}

function assert(cond, msg) {
  if (cond) {
    console.log(`✅ ${msg}`)
  } else {
    console.error(`❌ ${msg}`)
    process.exitCode = 1
  }
}

async function main() {
  // 1) GET /teams + headers de rate limit
  const teams = await api('GET', '/teams')
  assert(teams.status === 200, `GET /teams -> 200 (fue ${teams.status})`)
  assert(teams.rl.limit !== null && teams.rl.remaining !== null && teams.rl.reset !== null,
    `X-RateLimit-* presentes (limit=${teams.rl.limit} remaining=${teams.rl.remaining} reset=${teams.rl.reset})`)

  const team = (teams.json?.teams ?? []).find((t) => EDITOR_ROLES.has(t.role))
  if (!team) { console.error('No hay equipo con rol editor+; no se puede seguir.'); process.exit(1) }

  // 2) CRUD con el token read-write
  const create = await api('POST', `/teams/${team.id}/documents`, {
    body: { title: 'PAT smoke ' + new Date().toISOString(), content: '# Hola PAT\n\ntexto\n', format: 'markdown' },
  })
  assert(create.status === 201, `POST create -> 201 (fue ${create.status})`)
  const id = create.json?.document?.id
  if (!id) { console.error('No se creó el doc:', JSON.stringify(create.json)); process.exit(1) }

  const read = await api('GET', `/documents/${id}?format=markdown`)
  assert(read.status === 200 && typeof read.json?.document?.content === 'string', `GET doc markdown -> 200`)

  const patch = await api('PATCH', `/documents/${id}`, { body: { title: 'PAT smoke editado' } })
  assert(patch.status === 200 && patch.json?.ok === true, `PATCH -> 200 ok`)

  const del = await api('DELETE', `/documents/${id}`)
  assert(del.status === 204, `DELETE -> 204 (fue ${del.status})`)

  // 3) scope read-only (opcional)
  if (PAT_READ) {
    const roRead = await api('GET', '/teams', { token: PAT_READ })
    assert(roRead.status === 200, `[read] GET /teams -> 200`)
    const roWrite = await api('POST', `/teams/${team.id}/documents`, {
      token: PAT_READ,
      body: { title: 'no debería crearse' },
    })
    assert(roWrite.status === 403, `[read] POST create -> 403 (scope read; fue ${roWrite.status})`)
  } else {
    console.log('ℹ️  (Sin DOCSAPP_PAT_READ: salteo el test de scope read-only.)')
  }

  // 4) rate limit 429 (opcional; consume tu budget del minuto)
  if (process.env.DOCSAPP_BURST === '1') {
    let got429 = false
    for (let i = 0; i < 200 && !got429; i++) {
      const r = await api('GET', '/teams')
      if (r.status === 429) {
        got429 = true
        assert(r.rl.retryAfter !== null, `429 trae Retry-After (=${r.rl.retryAfter}s)`)
        console.log(`   (cortó en la request #${i + 1})`)
      }
    }
    assert(got429, `ráfaga alcanzó el rate limit (429)`)
  } else {
    console.log('ℹ️  (Sin DOCSAPP_BURST=1: salteo el test de 429.)')
  }

  console.log(process.exitCode ? '\n=== SMOKE con FALLOS ===' : '\n=== SMOKE OK ===')
}

main().catch((e) => { console.error('SMOKE CRASH:', e); process.exit(1) })
