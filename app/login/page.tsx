import Link from 'next/link'
import { AuthCard } from '@/components/auth-card'
import { safeNext } from '@/lib/auth/next'
import { getDictionary, getLocale } from '@/lib/i18n'
import { login } from './actions'

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string }>
}) {
  const { error, next: rawNext } = await searchParams
  const t = getDictionary(await getLocale())
  const next = rawNext ? safeNext(rawNext) : undefined
  const signupHref = next ? `/signup?next=${encodeURIComponent(next)}` : '/signup'

  return (
    <AuthCard
      title={t.auth.loginTitle}
      action={login}
      submitLabel={t.auth.loginSubmit}
      error={error}
      next={next}
      footer={
        <>
          {t.auth.noAccount}{' '}
          <Link href={signupHref} className="font-medium underline">
            {t.auth.createAccount}
          </Link>
        </>
      }
    />
  )
}
