// Edita el cuerpo de un doc puntual por API (para probar el broadcast EN VIVO:
// abrí el doc en el browser y corré esto mientras mirás).
//
// Uso:
//   DOCSAPP_EMAIL=... DOCSAPP_PASSWORD=... node scripts/api-patch.mjs <docId> "markdown..."
// Si no pasás markdown, usa una línea con timestamp.

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
const EMAIL = process.env.DOCSAPP_EMAIL
const PASSWORD = process.env.DOCSAPP_PASSWORD
const BASE = process.env.DOCSAPP_API_BASE ?? 'http://localhost:3000/api/v1'
const DOC_ID = process.argv[2]
const MD = process.argv.slice(3).join(' ') || `# Editado en vivo\n\nPATCH a las ${new Date().toISOString()}\n`

if (!SUPABASE_URL || !SUPABASE_ANON || !EMAIL || !PASSWORD || !DOC_ID) {
  console.error('Uso: DOCSAPP_EMAIL=.. DOCSAPP_PASSWORD=.. node scripts/api-patch.mjs <docId> "markdown.."')
  process.exit(2)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON)
const { data, error } = await supabase.auth.signInWithPassword({ email: EMAIL, password: PASSWORD })
if (error || !data.session) { console.error('Login falló:', error?.message); process.exit(1) }

const res = await fetch(`${BASE}/documents/${DOC_ID}`, {
  method: 'PATCH',
  headers: { Authorization: `Bearer ${data.session.access_token}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ content: MD, format: 'markdown' }),
})
console.log(`PATCH ${DOC_ID} -> ${res.status}:`, await res.text())
