'use server'

import crypto from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getAuthUser } from '@/lib/auth/user'
import { getDictionary, getLocale } from '@/lib/i18n'
import { sha256hex } from '@/lib/api/jwt'
import type { ApiTokenRow, ApiTokenScope } from '@/lib/types'

type CreateResult =
  | { ok: true; token: string; row: ApiTokenRow }
  | { ok: false; error: string }

// Presets de vencimiento permitidos (días). Cualquier otro valor → sin vencimiento.
const EXPIRY_DAYS = new Set([30, 90])

// Crea un Personal Access Token para el usuario actual. Genera el valor crudo
// (`dapp_…`, 256 bits), guarda SOLO su hash SHA-256 + un prefijo visible, y lo
// devuelve UNA vez (nunca se puede volver a leer). RLS: insert own-only.
export async function createApiToken(
  name: string,
  scope: ApiTokenScope,
  expiresInDays: number | null,
): Promise<CreateResult> {
  const t = getDictionary(await getLocale())
  const supabase = await createClient()
  const user = await getAuthUser()
  if (!user) return { ok: false, error: t.errors.notAuthenticated }

  const trimmed = name.trim().slice(0, 100)
  if (!trimmed) return { ok: false, error: t.tokens.nameRequired }

  const safeScope: ApiTokenScope = scope === 'read' ? 'read' : 'read_write'
  const days = expiresInDays && EXPIRY_DAYS.has(expiresInDays) ? expiresInDays : null
  const expires_at = days ? new Date(Date.now() + days * 86_400_000).toISOString() : null

  const raw = `dapp_${crypto.randomBytes(32).toString('base64url')}`
  const token_hash = sha256hex(raw)
  const token_prefix = raw.slice(0, 12)

  const { data, error } = await supabase
    .from('api_tokens')
    .insert({
      user_id: user.id,
      name: trimmed,
      token_hash,
      token_prefix,
      scope: safeScope,
      expires_at,
    })
    .select('id, name, scope, token_prefix, expires_at, last_used_at, created_at')
    .single()
  if (error || !data) return { ok: false, error: error?.message ?? t.tokens.createError }

  revalidatePath('/profile/tokens')
  return { ok: true, token: raw, row: data as ApiTokenRow }
}

// Revoca (borra) un token propio: deja de funcionar de inmediato (el hash ya no
// existe → `consume_api_token` no lo encuentra). RLS: delete own-only.
export async function revokeApiToken(id: string): Promise<{ ok: boolean; error?: string }> {
  const t = getDictionary(await getLocale())
  const supabase = await createClient()
  const user = await getAuthUser()
  if (!user) return { ok: false, error: t.errors.notAuthenticated }

  const { error } = await supabase.from('api_tokens').delete().eq('id', id)
  if (error) return { ok: false, error: error.message }

  revalidatePath('/profile/tokens')
  return { ok: true }
}
