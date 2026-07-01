import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getDictionary, getLocale } from '@/lib/i18n'
import ApiTokensManager from '@/components/api-tokens-manager'
import type { ApiTokenRow } from '@/lib/types'

export default async function TokensPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [{ data }, locale] = await Promise.all([
    supabase
      .from('api_tokens')
      .select('id, name, scope, token_prefix, expires_at, last_used_at, created_at')
      .order('created_at', { ascending: false }),
    getLocale(),
  ])
  const t = getDictionary(locale)
  const tokens = (data ?? []) as ApiTokenRow[]

  return (
    <div className="mx-auto w-full max-w-xl flex-1 px-6 py-10">
      <Link href="/profile" className="text-sm text-zinc-500 hover:underline">
        ← {t.profile.title}
      </Link>
      <h1 className="mt-3 text-2xl font-semibold tracking-tight text-fg">{t.tokens.title}</h1>
      <p className="mt-1 text-sm text-muted">{t.tokens.subtitle}</p>

      <ApiTokensManager initialTokens={tokens} locale={locale} />
    </div>
  )
}
